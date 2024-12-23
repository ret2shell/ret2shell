use axum::{
  extract::{Query, State},
  middleware,
  response::IntoResponse,
  routing::{get, patch, post},
  Extension, Json, Router,
};
use chrono::Utc;
use nanoid::nanoid;
use r2s_auditor::Auditor;
use r2s_database::{
  extra, game, submission, team,
  user::{self, Permission},
  user2_team,
};
use r2s_migrator::Database;
use serde::Deserialize;
use tracing::info;

use super::worker;
use crate::{
  middleware::{
    auth::{self, is_game_admin, Token},
    data,
  },
  traits::{GlobalState, ResponseError},
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .route(
      "/self",
      get(get_self_team)
        .patch(update_self_team)
        .delete(leave_self_team),
    )
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      data::prepare_team_info,
    ))
    .route("/", post(create_team).patch(join_team))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Basic,
      Permission::Verified
    )))
    .route("/", get(get_team_list))
    .nest(
      "/:team",
      Router::new()
        .route("/extra", post(create_team_extra).delete(delete_team_extra))
        .route("/", patch(update_team_info).delete(delete_team))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          auth::game_admin_required,
        ))
        .route("/", get(get_team_info))
        .route("/rank", get(get_team_rank))
        .route("/member", get(get_team_members))
        .route("/solve", get(get_team_solves))
        .route("/extra", get(get_team_extra))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(team, false),
        )),
    )
}

async fn get_self_team(
  State(ref db): State<Database>, team_ext: Option<Extension<team::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = team_ext.ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  let team = team::get_ex(&db.conn, team.id).await?;
  Ok(Json(team))
}

#[derive(Deserialize)]
struct UpdateTeamRequest {
  pub name: String,
  pub institute_id: Option<i64>,
}

async fn update_self_team(
  State(ref db): State<Database>, State(ref auditor): State<Auditor>,
  Extension(game): Extension<game::Model>, Extension(team): Extension<team::Model>,
  Json(req): Json<UpdateTeamRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let mut team = team;
  if game.team_size > 1 {
    team.name = req.name;
  }
  if game.archived() {
    return Err(ResponseError::PreconditionFailed(
      "game is archived".to_owned(),
    ));
  }
  if req.institute_id.is_some() && req.institute_id != team.institute_id {
    let members = team::get_members(&db.conn, team.id).await?;
    for member in members {
      if member.institute_id != req.institute_id {
        return Err(ResponseError::PreconditionFailed(
          "institute not match".to_owned(),
        ));
      }
    }
    team.institute_id = req.institute_id;
  } else if req.institute_id.is_none() {
    team.institute_id = req.institute_id;
  }
  if game.enable_audit {
    team.state = if auditor.audit_content(&team.name) {
      team::State::Pending
    } else {
      team::State::Passed
    };
  }

  let result = team::update(&db.conn, team).await?;
  Ok(Json(result))
}

async fn leave_self_team(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<team::Model>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.in_progress() {
    return Err(ResponseError::PreconditionFailed(
      "game is in progress, can not leave team".to_owned(),
    ));
  }
  if game.archived() {
    return Err(ResponseError::PreconditionFailed(
      "game is archived".to_owned(),
    ));
  }
  user2_team::user_leave_team(&db.conn, token.id, team.id).await?;
  let members = team::get_members(&db.conn, team.id).await?;
  if members.is_empty() {
    team::delete(&db.conn, team.id).await?;
  }
  Ok(())
}

#[derive(Deserialize)]
struct TeamInfoQuery {
  pub ex: Option<bool>,
}

async fn get_team_info(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<team::Model>, Extension(token): Extension<Token>,
  Query(query): Query<TeamInfoQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.id != team.game_id {
    return Err(ResponseError::NotFound("team not found".to_owned()));
  }
  let result = if query.ex.unwrap_or(false) {
    team::get_ex(&db.conn, team.id)
      .await?
      .ok_or(ResponseError::NotFound("team not found".to_string()))?
  } else {
    team.into()
  };
  if is_game_admin!(token, game) {
    Ok(Json(result))
  } else {
    Ok(Json(result.desensitize()))
  }
}

async fn get_team_solves(
  State(ref db): State<Database>, Extension(team): Extension<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(
    submission::get_list_ex(
      &db.conn,
      true,
      false,
      Some(team.game_id),
      None,
      Some(team.id),
      None,
      true,
    )
    .await?,
  ))
}

async fn get_team_rank(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if team.state < team::State::Hidden {
    return Err(ResponseError::PreconditionFailed(
      "team is not valid".to_owned(),
    ));
  }
  let result = team::count_rank(
    &db.conn,
    game.id,
    team.score,
    team.last_active_at,
    team.state == team::State::Hidden,
  )
  .await?;
  Ok(Json(result))
}

async fn get_team_members(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<team::Model>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  let result = team::get_members(&db.conn, team.id).await?;
  if is_game_admin!(token, game) {
    Ok(Json(result))
  } else {
    Ok(Json(result.into_iter().map(|m| m.desensitize()).collect()))
  }
}

#[derive(Deserialize)]
struct TeamListQuery {
  pub page: Option<u64>,
  pub page_size: Option<u64>,
  pub order: Option<String>,
  pub filter: Option<String>,
  pub institute_id: Option<i64>,
  pub asc: Option<bool>,
  pub min_state: Option<team::State>,
}

async fn get_team_list(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, Query(query): Query<TeamListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let min_state = if query
    .min_state
    .clone()
    .is_some_and(|s| s < team::State::Hidden)
    && !is_game_admin!(token, game)
  {
    Some(team::State::Hidden)
  } else {
    query.min_state
  };
  let (teams, total) = team::get_page(
    &db.conn,
    game.id,
    query.page.unwrap_or(1),
    query.page_size.unwrap_or(15),
    min_state,
    query.institute_id,
    query.filter,
    query.order,
    query.asc.unwrap_or(true),
  )
  .await?;
  let teams = if is_game_admin!(token, game) {
    teams
  } else {
    teams.into_iter().map(|t| t.desensitize()).collect()
  };
  Ok(Json((teams, total)))
}

async fn get_team_extra(
  State(ref db): State<Database>, Extension(team): Extension<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(extra::get_list_ex(&db.conn, team.id).await?))
}

#[derive(Deserialize)]
struct CreateTeamRequest {
  pub name: String,
}

async fn create_team(
  State(ref db): State<Database>, State(ref auditor): State<Auditor>,
  Extension(game): Extension<game::Model>, Extension(token): Extension<Token>,
  Json(req): Json<CreateTeamRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.register_at > Utc::now() {
    return Err(ResponseError::PreconditionFailed(
      "game has not start yet".to_owned(),
    ));
  }
  if (game.start_at < Utc::now() && !game.can_register_after_started) || game.end_at < Utc::now() {
    return Err(ResponseError::PreconditionFailed(
      "too late to participate".to_owned(),
    ));
  }
  let user = user::get(&db.conn, token.id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("user not found".to_owned()))?;
  if game.access_policy.restrict
    && !game
      .access_policy
      .institutes
      .contains(&user.institute_id.unwrap_or(0))
  {
    return Err(ResponseError::PreconditionFailed(
      "institute not allowed".to_owned(),
    ));
  }
  if team::get_by_user_id(&db.conn, game.id, token.id)
    .await?
    .is_some()
  {
    return Err(ResponseError::Conflict(
      "can not join multiple teams".to_owned(),
    ));
  }
  let state = if game.enable_audit {
    if auditor.audit_content(&req.name) {
      team::State::Pending
    } else {
      team::State::Passed
    }
  } else {
    team::State::Passed
  };
  let team_token = Some(nanoid!());
  let team = team::create(
    &db.conn,
    team::Model {
      name: req.name,
      game_id: game.id,
      state,
      token: team_token,
      institute_id: user.institute_id,
      ..Default::default()
    },
  )
  .await?;
  user2_team::user_join_team(&db.conn, token.id, team.id).await?;
  info!(
    "team created: {}:'{}' by {}:'{}' ({}) in game {}:'{}'",
    team.id, team.name, token.id, token.account, token.nickname, game.id, game.name
  );
  Ok(Json(team))
}

#[derive(Deserialize)]
struct JoinTeamRequest {
  pub token: String,
}

async fn join_team(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, Json(req): Json<JoinTeamRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.register_at > Utc::now() {
    return Err(ResponseError::PreconditionFailed(
      "game has not start yet".to_owned(),
    ));
  }
  if (game.start_at < Utc::now() && !game.can_register_after_started) || game.end_at < Utc::now() {
    return Err(ResponseError::PreconditionFailed(
      "too late to participate".to_owned(),
    ));
  }
  let user = user::get(&db.conn, token.id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("user not found".to_owned()))?;
  if game.access_policy.restrict
    && !game
      .access_policy
      .institutes
      .contains(&user.institute_id.unwrap_or(0))
  {
    return Err(ResponseError::PreconditionFailed(
      "institute not allowed".to_owned(),
    ));
  }
  if team::get_by_user_id(&db.conn, game.id, token.id)
    .await?
    .is_some()
  {
    return Err(ResponseError::Conflict(
      "can not join multiple teams".to_owned(),
    ));
  }
  let team = team::get_by_token(&db.conn, game.id, &req.token)
    .await?
    .ok_or_else(|| ResponseError::NotFound("team".to_owned()))?;
  let members = team::get_members(&db.conn, team.id).await?;
  if members.len() >= (game.team_size as usize) {
    return Err(ResponseError::PreconditionFailed("team is full".to_owned()));
  }
  if team
    .institute_id
    .is_some_and(|v| user.institute_id.is_some_and(|w| v != w) || user.institute_id.is_none())
  {
    return Err(ResponseError::PreconditionFailed(
      "institute not match".to_owned(),
    ));
  }
  user2_team::user_join_team(&db.conn, token.id, team.id).await?;
  info!(
    "{}:'{}' ({}) joined team {}:'{}' in game {}:'{}'",
    token.id, token.account, token.nickname, team.id, team.name, game.id, game.name
  );
  Ok(Json(team))
}

async fn update_team_info(
  State(ref db): State<Database>, Extension(team): Extension<team::Model>,
  Json(req): Json<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  // TODO: update scoreboard when team state changed
  let result = team::update(
    &db.conn,
    team::Model {
      id: team.id,
      game_id: team.game_id,
      ..req
    },
  )
  .await?;
  Ok(Json(result))
}

async fn delete_team(
  State(ref db): State<Database>, Extension(team): Extension<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  team::delete(&db.conn, team.id).await?;
  Ok(())
}

async fn create_team_extra(
  State(db): State<Database>, Extension(team): Extension<team::Model>,
  Json(req): Json<extra::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let result = extra::create(
    &db.conn,
    extra::Model {
      id: 0,
      team_id: team.id,
      ..req
    },
  )
  .await?;
  tokio::spawn(async move {
    worker::update_team_state(&db, team).await.ok();
  });
  Ok(Json(result))
}

#[derive(Deserialize)]
struct DeleteTeamExtraQuery {
  pub id: i64,
}

async fn delete_team_extra(
  State(db): State<Database>, Extension(team): Extension<team::Model>,
  Query(req): Query<DeleteTeamExtraQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let extra = extra::get(&db.conn, req.id).await?;
  if extra.is_none() || extra.is_some_and(|e| e.team_id != team.id) {
    return Err(ResponseError::NotFound("extra not found".to_owned()));
  }
  extra::delete(&db.conn, req.id).await?;
  tokio::spawn(async move {
    worker::update_team_state(&db, team).await.ok();
  });
  Ok(())
}

use axum::{
  Extension, Json, Router,
  extract::{Query, State},
  middleware,
  response::IntoResponse,
  routing::{get, patch, post},
};
use chrono::Utc;
use nanoid::nanoid;
use r2s_auditor::Auditor;
use r2s_database::{
  challenge, extra, game, submission, team,
  user::{self, Permission},
  user2_team,
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use sea_orm::TransactionTrait;
use serde::Deserialize;
use tower_http::request_id::RequestId;
use tracing::{error, info, warn};

use super::{is_game_admin, worker};
use crate::{
  middleware::{auth, data},
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
    .route("/query", get(query_team_by_token))
    .nest(
      "/{team}",
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
          data::prepare_data!(team, false, id, name),
        )),
    )
}

async fn get_self_team(
  State(ref db): State<Database>, team_ext: Extension<Option<team::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = team_ext
    .0
    .ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  let team = team::get_ex(&db.conn, team.id).await?;
  Ok(Json(team))
}

#[derive(Deserialize)]
struct UpdateTeamRequest {
  pub name: String,
  pub tag: Option<String>,
  pub institute_id: Option<i64>,
}

async fn update_self_team(
  State(ref db): State<Database>, State(ref auditor): State<Auditor>,
  Extension(token): Extension<auth::Token>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<Option<team::Model>>, Json(req): Json<UpdateTeamRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let mut team = team.ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  if game.team_size > 1 {
    team.name = req.name;
  } else {
    team.name = token.nickname.clone();
  }
  team.tag = req.tag;
  if game.archived() {
    warn!("user try to update team in archived game");
    return Err(ResponseError::PreconditionFailed(
      "game is archived".to_owned(),
    ));
  }
  if req.institute_id.is_some() && req.institute_id != team.institute_id {
    let members = team::get_members(&db.conn, team.id).await?;
    for member in members {
      if member.institute_id != req.institute_id {
        warn!(
          member_id=%member.id, member_account=%member.account,
          "user try to update team institute but member not match",
        );
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
  Extension(team): Extension<Option<team::Model>>, Extension(token): Extension<auth::Token>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = team.ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  if game.in_progress() {
    warn!("user try to leave team in progress game");
    return Err(ResponseError::PreconditionFailed(
      "game is in progress, can not leave team".to_owned(),
    ));
  }
  if game.archived() {
    warn!("user try to leave team in archived game");
    return Err(ResponseError::PreconditionFailed(
      "game is archived".to_owned(),
    ));
  }
  let txn = db.conn.begin().await?;
  user2_team::user_leave_team(&txn, token.id, team.id).await?;
  let members = team::get_members(&txn, team.id).await?;
  if members.is_empty() {
    team::delete(&txn, team.id).await?;
  }
  txn.commit().await?;
  Ok(())
}

#[derive(Deserialize)]
struct TeamInfoQuery {
  pub ex: Option<bool>,
}

async fn get_team_info(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<team::Model>, Extension(token): Extension<auth::Token>,
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
  if auth::is_game_admin!(token, game) {
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
      false,
    )
    .await?,
  ))
}

async fn get_team_rank(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if team.state < team::State::Hidden {
    warn!("user try to get rank of invalid team");
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
  Extension(team): Extension<team::Model>, Extension(token): Extension<auth::Token>,
) -> Result<impl IntoResponse, ResponseError> {
  let result = team::get_members(&db.conn, team.id).await?;
  if auth::is_game_admin!(token, game) {
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
  Extension(token): Extension<auth::Token>, Query(query): Query<TeamListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let min_state = if query
    .min_state
    .clone()
    .is_some_and(|s| s < team::State::Hidden)
    && !auth::is_game_admin!(token, game)
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
  let teams = if auth::is_game_admin!(token, game) {
    teams
  } else {
    teams.into_iter().map(|t| t.desensitize()).collect()
  };
  Ok(Json((teams, total)))
}

async fn get_team_extra(
  State(ref db): State<Database>, Extension(token): Extension<auth::Token>,
  Extension(game): Extension<game::Model>, Extension(team): Extension<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let resp = extra::get_list_ex(&db.conn, team.id).await?;
  if is_game_admin!(&token, &game) {
    Ok(Json(resp))
  } else {
    let self_team = team::get_by_user_id(&db.conn, team.game_id, token.id).await?;
    if self_team.is_none_or(|t| t.id != team.id) {
      Ok(Json(resp.into_iter().map(|e| e.desensitize()).collect()))
    } else {
      Ok(Json(resp))
    }
  }
}

#[derive(Deserialize)]
struct CreateTeamRequest {
  pub name: String,
  pub tag: Option<String>,
}

async fn create_team(
  State(ref db): State<Database>, State(ref auditor): State<Auditor>,
  Extension(game): Extension<game::Model>, Extension(token): Extension<auth::Token>,
  Json(req): Json<CreateTeamRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.register_at > Utc::now() {
    warn!("user try to create team before game start");
    return Err(ResponseError::PreconditionFailed(
      "game has not start yet".to_owned(),
    ));
  }
  if (game.start_at < Utc::now() && !game.can_register_after_started) || game.end_at < Utc::now() {
    warn!("user try to create team after game end");
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
    warn!("user's institute is not allowed to join the game");
    return Err(ResponseError::PreconditionFailed(
      "institute not allowed".to_owned(),
    ));
  }
  if team::get_by_user_id(&db.conn, game.id, token.id)
    .await?
    .is_some()
  {
    warn!("user try to create multiple teams");
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
      tag: req.tag,
      ..Default::default()
    },
  )
  .await?;
  user2_team::user_join_team(&db.conn, token.id, team.id).await?;
  info!(
    team_id=%team.id, team_name=%team.name,
    "team created",
  );
  Ok(Json(team))
}

#[derive(Deserialize)]
struct JoinTeamRequest {
  pub token: String,
}

async fn join_team(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<auth::Token>, Json(req): Json<JoinTeamRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.register_at > Utc::now() {
    warn!("user try to join team before game start");
    return Err(ResponseError::PreconditionFailed(
      "game has not start yet".to_owned(),
    ));
  }
  if (game.start_at < Utc::now() && !game.can_register_after_started) || game.end_at < Utc::now() {
    warn!("user try to join team after game end");
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
    warn!("user's institute is not allowed to join the game");
    return Err(ResponseError::PreconditionFailed(
      "institute not allowed".to_owned(),
    ));
  }
  if team::get_by_user_id(&db.conn, game.id, token.id)
    .await?
    .is_some()
  {
    warn!("user try to join multiple teams");
    return Err(ResponseError::Conflict(
      "can not join multiple teams".to_owned(),
    ));
  }
  let team = team::get_by_token(&db.conn, game.id, &req.token)
    .await?
    .ok_or_else(|| ResponseError::NotFound("team".to_owned()))?;
  let members = team::get_members(&db.conn, team.id).await?;
  if members.len() >= (game.team_size as usize) {
    warn!(team_id=%team.id, team_name=%team.name, "user try to join team, but team size is full");
    return Err(ResponseError::PreconditionFailed("team is full".to_owned()));
  }
  if team
    .institute_id
    .is_some_and(|v| user.institute_id.is_some_and(|w| v != w) || user.institute_id.is_none())
  {
    warn!(
      team_id=%team.id, team_name=%team.name,
      "user try to join team, but institute not match",
    );
    return Err(ResponseError::PreconditionFailed(
      "institute not match".to_owned(),
    ));
  }
  user2_team::user_join_team(&db.conn, token.id, team.id).await?;
  info!(
    team_id=%team.id, team_name=%team.name,
    "user joined team",
  );
  Ok(Json(team))
}

async fn update_team_info(
  State(queue): State<Queue>, State(ref db): State<Database>,
  Extension(game): Extension<game::Model>, Extension(team): Extension<team::Model>,
  Extension(trace): Extension<RequestId>, Json(req): Json<team::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let result = team::update(
    &db.conn,
    team::Model {
      id: team.id,
      game_id: team.game_id,
      ..req.clone()
    },
  )
  .await?;
  if (team.state >= team::State::Hidden && req.state < team::State::Hidden)
    || (team.state < team::State::Hidden && req.state >= team::State::Hidden)
  {
    let db = db.clone();
    let queue = queue.clone();
    let team = team.clone();
    let game = game.clone();
    tokio::spawn(async move {
      // update scoreboard
      let challenges = match challenge::get_list(&db.conn, game.id, true).await {
        Ok(challenges) => challenges,
        Err(e) => {
          error!(error=?e, "failed to get challenges");
          return;
        }
      };
      let submissions = match submission::get_list(
        &db.conn,
        true,
        false,
        Some(game.id),
        None,
        Some(team.id),
        None,
        false,
      )
      .await
      {
        Ok(submissions) => submissions,
        Err(e) => {
          error!(error=?e, "failed to get submissions");
          return;
        }
      };
      for submission in submissions {
        let challenge = match challenges.iter().find(|c| c.id == submission.challenge_id) {
          Some(c) => c,
          None => continue,
        };
        queue
          .publish(
            "scoreboard",
            challenge.clone(),
            &trace.header_value().to_str().unwrap_or("UNKNOWN"),
          )
          .await
          .ok();
      }
    });
  }

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
    worker::game::update_team_state(&db, team).await.ok();
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
    worker::game::update_team_state(&db, team).await.ok();
  });
  Ok(())
}

#[derive(Deserialize)]
struct TeamTokenQuery {
  pub token: String,
}

async fn query_team_by_token(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<TeamTokenQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = team::get_by_token(&db.conn, game.id, &query.token)
    .await?
    .ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  Ok(Json(team))
}

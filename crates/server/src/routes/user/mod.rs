use axum::{
  Extension, Json, Router,
  extract::{Query, State},
  middleware,
  response::IntoResponse,
  routing::{get, patch},
};
use r2s_cache::Cache;
use r2s_database::{
  ip, oauth, submission, team,
  user::{self, Permission},
};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::{
  middleware::{
    auth::{self, Token, TokenTracker},
    data,
  },
  traits::{GlobalState, ResponseError},
  utility::{
    pagination::{DEFAULT_PAGE_SIZE, page, page_size},
    validation::{validate_account, validate_email, validate_nickname},
  },
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .nest(
      "/{user}",
      Router::new()
        .route("/oauth", get(get_oauth_list))
        .route("/ip", get(get_user_ip_list))
        .route("/", patch(update_user).delete(delete_user))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::User
        )))
        .route("/", get(get_user))
        .route("/team", get(get_teams))
        .route("/stats", get(get_submission_stats))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(user, false, id, account, nickname),
        )),
    )
    .route("/", get(get_user_list))
}

#[derive(Deserialize)]
struct UserListQuery {
  page: Option<u64>,
  page_size: Option<u64>,
  order: Option<String>,
  filter: Option<String>,
  institute_id: Option<i64>,
}

#[derive(Deserialize)]
struct SubmissionQuery {
  game_id: Option<i64>,
}

#[derive(Serialize)]
struct ChallengeStats {
  challenge_id: i64,
  challenge_name: String,
  solved: bool,
  total_submissions: u64,
  failed_submissions: u64,
}

#[derive(Serialize)]
struct SubmissionStats {
  total_submissions: u64,
  total_solved: u64,
  total_failed: u64,
  challenges: Vec<ChallengeStats>,
}

async fn get_user_list(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Query(query): Query<UserListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let results = user::get_page(
    &db.conn,
    page(query.page),
    page_size(query.page_size, DEFAULT_PAGE_SIZE),
    query.order,
    query.filter,
    token.permissions.0.contains(&user::Permission::User),
    query.institute_id,
  )
  .await?;
  if token.permissions.0.contains(&Permission::User) {
    Ok(Json(results))
  } else {
    Ok(Json((
      results.0.into_iter().map(|r| r.desensitize()).collect(),
      results.1,
    )))
  }
}

async fn get_user(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let user = user::get_ex(&db.conn, user.id).await?;
  let user = user.ok_or_else(|| ResponseError::NotFound("user not found".to_owned()))?;
  if token.permissions.0.contains(&Permission::User) || user.id == token.id {
    Ok(Json(user))
  } else if !user.hidden {
    Ok(Json(user.desensitize()))
  } else {
    Err(ResponseError::NotFound("user not found".to_owned()))
  }
}

async fn get_teams(
  State(ref db): State<Database>, Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let teams = team::get_list_by_user_id_ex(&db.conn, user.id).await?;
  Ok(Json(
    teams
      .into_iter()
      .map(|t| t.desensitize())
      .collect::<Vec<_>>(),
  ))
}

async fn logout_user(cache: &Cache, user_id: i64) -> Result<(), ResponseError> {
  while let Some(token) = cache
    .at("token")
    .pop::<String>(format!("user-{user_id}"))
    .await?
  {
    cache.at("token").del(&token).await.ok();
  }
  cache.del(format!("user-{user_id}")).await.ok();
  Ok(())
}

async fn update_user(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(user): Extension<user::Model>, Extension(token): Extension<Token>,
  Extension(token_tracker): Extension<TokenTracker>, Json(data): Json<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  validate_account(&data.account)?;
  validate_nickname(&data.nickname)?;
  let email = data
    .email
    .clone()
    .ok_or_else(|| ResponseError::BadRequest("email is required".to_owned()))?;
  validate_email(&email)?;
  for identity in [&data.account, &email] {
    if let Some(existing) = user::get_by_account_or_email(&db.conn, identity).await?
      && existing.id != user.id
    {
      return Err(ResponseError::Conflict("account already exists".to_owned()));
    }
  }
  let user = user::update(
    &db.conn,
    user::Model {
      account: data.account,
      nickname: data.nickname,
      email: data.email,
      description: data.description,
      avatar: data.avatar,
      institute_id: data.institute_id,
      permissions: data.permissions,
      hidden: data.hidden,
      banned: data.banned,
      ..user
    },
  )
  .await?;

  logout_user(cache, user.id).await?;

  if token.id == user.id {
    *(token_tracker.token.lock().await) = Token {
      id: user.id,
      account: user.account.clone(),
      nickname: user.nickname.clone(),
      permissions: user.permissions.clone(),
      ..Default::default()
    };
    token_tracker
      .renew_requested
      .store(true, std::sync::atomic::Ordering::Relaxed);
  }
  info!("user updated");
  Ok(Json(user))
}

async fn delete_user(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  user::delete(&db.conn, user.id).await?;
  logout_user(cache, user.id).await?;
  info!("user deleted");
  Ok(Json(user))
}

async fn get_user_ip_list(
  State(ref db): State<Database>, Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let ips = ip::get_list(&db.conn, user.id).await?;
  Ok(Json(ips))
}

async fn get_oauth_list(
  State(ref db): State<Database>, Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let oauths = oauth::get_list_ex(&db.conn, user.id).await?;
  Ok(Json(oauths))
}

async fn get_submission_stats(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(user): Extension<user::Model>, Query(query): Query<SubmissionQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if user.hidden && !token.permissions.0.contains(&Permission::User) && token.id != user.id {
    return Err(ResponseError::NotFound("user not found".to_owned()));
  }
  let stats = submission::get_user_submission_stats(&db.conn, query.game_id, user.id).await?;

  let total_submissions: u64 = stats.iter().map(|s| s.total_submissions as u64).sum();
  let total_solved = stats.iter().filter(|s| s.solved_count > 0).count() as u64;
  let total_failed: u64 = stats
    .iter()
    .map(|s| (s.total_submissions - s.solved_count) as u64)
    .sum();

  let challenges: Vec<ChallengeStats> = stats
    .iter()
    .map(|s| ChallengeStats {
      challenge_id: s.challenge_id,
      challenge_name: s.challenge_name.clone(),
      solved: s.solved_count > 0,
      total_submissions: s.total_submissions as u64,
      failed_submissions: (s.total_submissions - s.solved_count) as u64,
    })
    .collect();

  Ok(Json(SubmissionStats {
    total_submissions,
    total_solved,
    total_failed,
    challenges,
  }))
}

use std::collections::HashMap;

use axum::{
  extract::{Path, Query, State},
  http::StatusCode,
  middleware,
  response::IntoResponse,
  routing::{get, post},
  Extension, Json, Router,
};
use chrono::Utc;
use r2s_cache::Cache;
use r2s_config::captcha::ValidatorType;
use r2s_database::{
  config,
  user::{self, Permission, Permissions},
};
use r2s_migrator::Database;
use r2s_oauth::OAuth;
use r2s_queue::Queue;
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::{
  middleware::{
    auth::{captcha_protected, permission_required_all, Token, TokenTracker},
    data,
  },
  routes::account::{send_email, EmailType},
  traits::{GlobalState, ResponseError},
  utility::password::hash_password,
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .route(
      "/provider/{service}",
      get(get_oauth_provider)
        .patch(update_oauth_provider)
        .delete(delete_oauth_provider),
    )
    .route("/provider", post(create_oauth_provider))
    .route_layer(middleware::from_fn(permission_required_all!(
      Permission::User
    )))
    .route(
      "/bind",
      get(get_oauth_status)
        .post(bind_oauth_account)
        .delete(unbind_oauth_account),
    )
    .route_layer(middleware::from_fn(permission_required_all!(
      Permission::Verified
    )))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      data::prepare_user_info,
    ))
    .route("/login", post(login_with_oauth_account))
    .route("/register", post(register_with_oauth_account))
    .route("/provider", get(get_oauth_providers))
}

async fn get_oauth_providers(
  State(db): State<Database>,
) -> Result<impl IntoResponse, ResponseError> {
  let providers = r2s_database::oauth_provider::get_list(&db.conn).await?;

  Ok(Json(
    providers
      .into_iter()
      .map(|p| p.desensitize())
      .collect::<Vec<_>>(),
  ))
}

#[derive(Serialize)]
struct OAuthProviderResponse {
  item: r2s_database::oauth_provider::Model,
  lint: Option<String>,
}

async fn get_oauth_provider(
  State(db): State<Database>, State(oauth): State<OAuth>, Path(service): Path<String>,
) -> Result<impl IntoResponse, ResponseError> {
  let provider = r2s_database::oauth_provider::get_by_provider(&db.conn, &service).await?;
  match provider {
    Some(provider) => {
      let lint = oauth.lint(&provider.script).await;
      Ok(Json(OAuthProviderResponse {
        item: provider,
        lint: lint.err().map(|e| e.to_string()),
      }))
    }
    None => Err(ResponseError::NotFound("oauth provider".to_owned())),
  }
}

async fn create_oauth_provider(
  State(db): State<Database>, State(oauth): State<OAuth>,
  Json(provider): Json<r2s_database::oauth_provider::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let provider = r2s_database::oauth_provider::create(&db.conn, provider).await?;
  let lint = oauth.lint(&provider.script).await;
  Ok(Json(OAuthProviderResponse {
    item: provider,
    lint: lint.err().map(|e| e.to_string()),
  }))
}

async fn update_oauth_provider(
  State(db): State<Database>, State(oauth): State<OAuth>, Path(service): Path<String>,
  Json(provider): Json<r2s_database::oauth_provider::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let original_provider =
    match r2s_database::oauth_provider::get_by_provider(&txn, &service).await? {
      Some(m) => m,
      None => {
        return Err(ResponseError::NotFound("oauth provider".to_owned()));
      }
    };
  let provider = r2s_database::oauth_provider::update(&txn, original_provider.id, provider).await?;
  let lint = oauth.lint(&provider.script).await;
  oauth.expire(provider.provider.as_str()).await;
  txn.commit().await?;
  Ok(Json(OAuthProviderResponse {
    item: provider,
    lint: lint.err().map(|e| e.to_string()),
  }))
}

async fn delete_oauth_provider(
  State(db): State<Database>, Path(service): Path<String>,
) -> Result<impl IntoResponse, ResponseError> {
  let provider = match r2s_database::oauth_provider::get_by_provider(&db.conn, &service).await? {
    Some(m) => m,
    None => {
      return Err(ResponseError::NotFound("oauth provider".to_owned()));
    }
  };
  r2s_database::oauth_provider::delete(&db.conn, provider.id).await?;
  Ok(StatusCode::OK)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OAuthCachedToken {
  pub provider: String,
  pub auth_key: String,
  pub data: HashMap<String, String>,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct OAuthLoginResponse {
  pub token: Option<String>,
  pub data: Option<HashMap<String, String>>,
}
async fn login_with_oauth_account(
  State(db): State<Database>, State(oauth): State<OAuth>, State(cache): State<Cache>,
  Extension(token_tracker): Extension<TokenTracker>, Query(params): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, ResponseError> {
  let provider = params.get("service").ok_or(ResponseError::BadRequest(
    "oauth service params required".to_owned(),
  ))?;

  let provider_str = provider.as_str();
  let provider = match r2s_database::oauth_provider::get_by_provider(&db.conn, provider_str).await?
  {
    Some(m) => m,
    None => {
      return Err(ResponseError::NotFound("oauth service".to_owned()));
    }
  };
  oauth.preload(provider_str, &provider.script).await?;

  let oauth_item = oauth.login(provider_str, &params).await?;
  let auth_key = oauth_item.get("auth_key").ok_or(ResponseError::NotFound(
    "missing auth_key in oauth server response".to_owned(),
  ))?;

  let oauth_item =
    match r2s_database::oauth::get_by_auth_key(&db.conn, provider_str, auth_key).await? {
      Some(item) => item,
      None => {
        let temp_token = nanoid::nanoid!(32);
        let cached_token = OAuthCachedToken {
          provider: provider_str.to_owned(),
          auth_key: auth_key.clone().to_owned(),
          data: oauth_item.clone(),
        };
        cache
          .at("oauth")
          .set_ex(&temp_token, cached_token, 30 * 60)
          .await?;
        info!("OAuth user {auth_key} not found, temp token {temp_token} generated for register");
        return Ok((
          StatusCode::CREATED,
          Json(OAuthLoginResponse {
            token: Some(temp_token),
            data: Some(oauth_item),
          }),
        ));
      }
    };
  let user = r2s_database::user::get(&db.conn, oauth_item.user_id).await?;
  let user = match user {
    Some(user) => user,
    None => {
      return Err(ResponseError::NotFound("oauth user account".to_owned()));
    }
  };
  info!(
    "User logged in via oauth {provider_str}: {}:'{}' ({}) <{}>",
    user.id,
    user.account,
    user.nickname,
    user.email.unwrap_or_default()
  );
  *(token_tracker.token.lock().await) = Token {
    id: user.id,
    account: user.account.clone(),
    nickname: user.nickname.clone(),
    permissions: user.permissions,
    ..Default::default()
  };
  token_tracker
    .renew_requested
    .store(true, std::sync::atomic::Ordering::Relaxed);

  Ok((StatusCode::OK, Json(OAuthLoginResponse::default())))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct OAuthRegisterRequest {
  pub token: String,
  pub account: String,
  pub nickname: String,
  pub email: String,
  pub password: String,
  pub captcha_id: String,
  pub captcha_answer: String,
}

async fn register_with_oauth_account(
  State(db): State<Database>, State(cache): State<Cache>, State(queue): State<Queue>,
  Extension(config): Extension<config::Model>, Extension(token_tracker): Extension<TokenTracker>,
  Json(req): Json<OAuthRegisterRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if config
    .captcha
    .clone()
    .is_some_and(|c| c.enabled && c.validator != ValidatorType::None)
  {
    captcha_protected!(cache, &req.captcha_id, &req.captcha_answer);
  }
  let cached_token = cache
    .at("oauth")
    .get::<OAuthCachedToken>(&req.token)
    .await?;
  let cached_token = match cached_token {
    Some(token) => token,
    None => {
      return Err(ResponseError::NotFound("oauth token".to_owned()));
    }
  };
  let txn = db.conn.begin().await?;

  // if user::get_user_by_account(db, &body.email).await.is_ok() {
  //     return Err((StatusCode::CONFLICT, "account already exists"));
  // }
  if user::get_by_account_or_email(&txn, &req.email)
    .await?
    .is_some()
    || user::get_by_account_or_email(&txn, &req.account)
      .await?
      .is_some()
  {
    return Err(ResponseError::Conflict("account already exists".to_owned()));
  }

  let password = hash_password(&req.password)?;

  let mut permissions = match user::count(&txn, true, None, None, false).await? {
    0 => Permissions(vec![
      Permission::Basic,
      Permission::Verified,
      Permission::Calendar,
      Permission::Wiki,
      Permission::Bulletin,
      Permission::Game,
      Permission::Host,
      Permission::User,
      Permission::Statistics,
      Permission::DevOps,
    ]),
    _ => Permissions(vec![Permission::Basic]),
  };
  if !config.email.as_ref().is_some_and(|c| c.enabled) && permissions.0.len() == 1 {
    permissions.0.push(Permission::Verified);
  }
  let email = req.email.clone();
  let institute = r2s_database::institute::get_by_provider(&txn, &cached_token.provider).await?;
  let new_user = user::Model {
    account: req.account.clone(),
    nickname: req.nickname.clone(),
    password: Some(password),
    email: Some(req.email),
    registered_at: Utc::now(),
    permissions,
    hidden: false,
    banned: false,
    institute_id: institute.clone().map(|i| i.id),
    ..Default::default()
  };
  let user = user::create(&txn, new_user).await?;

  let new_oauth = r2s_database::oauth::Model {
    user_id: user.id,
    provider: cached_token.provider.clone(),
    auth_key: cached_token.auth_key.clone(),
    data: Some(serde_json::to_value(cached_token.data)?),
    created_at: Utc::now(),
    updated_at: Utc::now(),
    ..Default::default()
  };
  r2s_database::oauth::create(&txn, new_oauth).await?;

  txn.commit().await?;

  send_email(
    &cache,
    &queue,
    &config,
    &user.account,
    &email,
    EmailType::Verify,
  )
  .await
  .ok();
  info!(
    "User registered: {} ({}) <{}>",
    user.nickname,
    user.account,
    user.email.unwrap_or_default()
  );
  *(token_tracker.token.lock().await) = Token {
    id: user.id,
    account: user.account.clone(),
    nickname: user.nickname.clone(),
    permissions: user.permissions,
    ..Default::default()
  };
  token_tracker
    .renew_requested
    .store(true, std::sync::atomic::Ordering::Relaxed);

  Ok(())
}

async fn get_oauth_status(
  State(db): State<Database>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  let oauth_items = r2s_database::oauth::get_list_ex(&db.conn, token.id).await?;
  Ok(Json(oauth_items))
}

async fn bind_oauth_account(
  State(db): State<Database>, State(cache): State<Cache>, State(oauth): State<OAuth>,
  Extension(user): Extension<r2s_database::user::Model>,
  Query(params): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let action_times = cache.at("oauth").get::<i64>(user.id).await?;
  if action_times.is_some() && action_times.unwrap() > 5 {
    return Err(ResponseError::TooManyRequests(
      "too many requests, please try again 15 mins later".to_owned(),
      format!(
        "user {} has requested change oauth account too many times",
        user.id
      ),
    ));
  }
  cache.at("oauth").incr(user.id).await?;
  cache.at("oauth").expire(user.id, 15 * 60).await?;

  let provider = params
    .get("service")
    .ok_or(ResponseError::BadRequest("service required".to_owned()))?;
  let provider_str = provider.as_str();
  let provider = match r2s_database::oauth_provider::get_by_provider(&txn, provider_str).await? {
    Some(m) => m,
    None => {
      return Err(ResponseError::NotFound("oauth service".to_owned()));
    }
  };

  oauth.preload(provider_str, &provider.script).await?;
  let data = oauth
    .bind(
      provider_str,
      &params,
      &[
        ("account", user.account.clone()),
        ("nickname", user.nickname.clone()),
        ("email", user.email.clone().unwrap_or_default()),
      ]
      .iter()
      .cloned()
      .map(|(k, v)| (k.to_owned(), v.to_owned()))
      .collect(),
    )
    .await?;
  let auth_key = data
    .get("auth_key")
    .ok_or(ResponseError::NotFound(
      "missing auth_key in oauth server response".to_owned(),
    ))?
    .to_owned();

  let bind_institute = r2s_database::institute::get_by_provider(&txn, provider_str).await?;

  let check_prev_oauth =
    r2s_database::oauth::get_by_auth_key(&txn, provider_str, &auth_key).await?;
  if check_prev_oauth.is_some() {
    return Err(ResponseError::Conflict(
      "oauth account already binded".to_owned(),
    ));
  }

  let oauth_item = r2s_database::oauth::Model {
    id: 0,
    user_id: user.id,
    provider: provider_str.to_owned(),
    auth_key,
    institute_id: bind_institute.clone().map(|i| i.id),
    data: Some(serde_json::to_value(data)?),
    created_at: Utc::now(),
    updated_at: Utc::now(),
  };
  r2s_database::oauth::create(&db.conn, oauth_item).await?;
  if let Some(institute) = bind_institute {
    r2s_database::user::update(
      &db.conn,
      r2s_database::user::Model {
        id: user.id,
        institute_id: Some(institute.id),
        ..user
      },
    )
    .await?;
  }
  Ok(StatusCode::OK)
}

#[derive(Deserialize)]
struct UnbindOAuthRequest {
  pub id: i64,
}

async fn unbind_oauth_account(
  State(db): State<Database>, State(cache): State<Cache>, Extension(token): Extension<Token>,
  Query(params): Query<UnbindOAuthRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let action_times = cache.at("oauth").get::<i64>(token.id).await?;
  if action_times.is_some() && action_times.unwrap() > 5 {
    return Err(ResponseError::TooManyRequests(
      "too many requests, please try again 15 mins later".to_owned(),
      format!(
        "user {} has requested change oauth account too many times",
        token.id
      ),
    ));
  }
  cache.at("oauth").incr(token.id).await?;
  cache.at("oauth").expire(token.id, 15 * 60).await?;
  let oauth_item = r2s_database::oauth::get(&db.conn, params.id).await?;
  let oauth_item = match oauth_item {
    Some(item) => item,
    None => {
      return Err(ResponseError::NotFound(
        "oauth account not found".to_owned(),
      ));
    }
  };
  if oauth_item.institute_id.is_some() {
    let games =
      r2s_database::game::get_list(&db.conn, Some(Utc::now()), None, None, Some(Utc::now()))
        .await?;
    for game in games {
      if r2s_database::team::get_by_user_id(&db.conn, game.id, token.id)
        .await?
        .is_some()
      {
        return Err(ResponseError::Forbidden(
          "you can not unbind oauth account before game archived".to_owned(),
          format!(
            "user {}:'{}' ({}) want to unbind oauth account {}:'{}' before game {}:'{}' archived",
            token.id,
            token.account,
            token.nickname,
            oauth_item.provider,
            oauth_item.auth_key,
            game.id,
            game.name
          ),
        ));
      }
    }
  }
  if oauth_item.user_id != token.id {
    return Err(ResponseError::Forbidden(
      "you can only unbind your own oauth account".to_owned(),
      format!(
        "user {}:'{}' ({}) want to unbind oauth account {}:'{}' which is not belong to him",
        token.id, token.account, token.nickname, oauth_item.provider, oauth_item.auth_key
      ),
    ));
  };
  r2s_database::oauth::delete(&db.conn, oauth_item.id).await?;
  if oauth_item.institute_id.is_some() {
    let user = r2s_database::user::get(&db.conn, token.id).await?;
    let user = match user {
      Some(user) => user,
      None => {
        return Err(ResponseError::NotFound("user not found".to_owned()));
      }
    };
    r2s_database::user::update(
      &db.conn,
      r2s_database::user::Model {
        id: user.id,
        institute_id: None,
        ..user
      },
    )
    .await?;
  }

  Ok(StatusCode::OK)
}

use std::sync::{Arc, atomic::AtomicBool};

use axum::{
  Extension,
  extract::{Request, State},
  http::header::{self, WWW_AUTHENTICATE},
  middleware::Next,
  response::IntoResponse,
};
use base64::Engine;
use chrono::Utc;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use r2s_cache::Cache;
use r2s_config::auth;
use r2s_database::{
  challenge, config, game, team,
  user::{self, Permission, Permissions},
};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::{Span, debug, error, info, warn};

use crate::{traits::ResponseError, utility::password::verify_password};

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Token {
  pub id: i64,
  pub account: String,
  pub nickname: String,
  pub permissions: Permissions,
  pub exp: i64,
}

#[derive(Clone, Debug)]
pub struct TokenTracker {
  pub token: Arc<Mutex<Token>>,
  pub renew_requested: Arc<AtomicBool>,
  pub original: Option<String>,
}

pub async fn decode_token(token: &str, key: &str) -> Token {
  let token_data = match decode::<Token>(
    token,
    &DecodingKey::from_secret(key.as_ref()),
    &Validation::new(Algorithm::HS256),
  ) {
    Ok(c) => c,
    Err(err) => {
      debug!(error=?err, token=?token, "decode token failed");
      return Token::default();
    }
  };
  token_data.claims
}

async fn distribute_token(
  token: &Token, key: &str, expires_time: i64,
) -> Result<String, ResponseError> {
  let new_token = Token {
    exp: Utc::now().timestamp() + expires_time,
    ..token.clone()
  };
  encode(
    &Header::default(),
    &new_token,
    &EncodingKey::from_secret(key.as_ref()),
  )
  .map_err(|err| {
    error!(error=?err, "failed to encode token");
    ResponseError::InternalServerError(
      "failed to encode token, please contact server admin".to_owned(),
    )
  })
}

async fn extract_bearer_token(
  auth_config: &auth::Config, cache: &Cache, token: &str,
) -> Result<(Token, TokenTracker), ResponseError> {
  let token = token.split_whitespace().nth(1).unwrap_or_default();
  let valid = cache.at("token").exists(token).await?;

  let token_obj = if valid {
    decode_token(token, &auth_config.signing_key).await
  } else {
    Token::default()
  };
  debug!(?token, decoded=?token_obj, "user requested with token");

  let last_time = token_obj.exp - Utc::now().timestamp();

  let token_tracker = TokenTracker {
    token: Arc::new(Mutex::new(token_obj.clone())),
    renew_requested: Arc::new(AtomicBool::new(
      last_time > 0 && last_time < auth_config.buffer_time,
    )),
    original: Some(token.to_owned()),
  };

  debug!(?token, "extracted token");

  Ok((token_obj, token_tracker))
}

async fn extract_basic_token(
  db: &Database, cache: &Cache, token: &str,
) -> Result<(Token, TokenTracker), ResponseError> {
  let (account, password) = {
    let decoded = base64::engine::general_purpose::STANDARD
      .decode(token.split_whitespace().nth(1).unwrap_or_default())
      .map_err(|_| ResponseError::BadRequest("invalid basic token".to_owned()))?;
    let result = String::from_utf8(decoded)
      .map_err(|_| ResponseError::BadRequest("invalid basic token".to_owned()))?;
    match result.split_once(':') {
      Some((account, password)) => (account.to_owned(), password.to_owned()),
      None => {
        return Err(ResponseError::BadRequest("invalid basic token".to_owned()));
      }
    }
  };

  let attempts = cache.at("login").get::<i64>(&account).await?;
  if attempts.is_some_and(|attempts| attempts > 5) {
    warn!(%account, attempts, "too many login attempts");
    return Err(ResponseError::TooManyRequests(
      "this account is frozen in 30 mins".to_owned(),
    ));
  }

  let user = user::get_by_account_or_email(&db.conn, &account).await?;
  let user = match user {
    Some(user) => user,
    None => {
      warn!(%account, "account not found");
      return Err(ResponseError::Forbidden(
        "account or password is wrong".to_owned(),
      ));
    }
  };

  if user.banned || !user.permissions.0.contains(&Permission::Basic) {
    warn!(id=%user.id, account=%user.account, nickname=%user.nickname, "account is banned");
    return Err(ResponseError::Forbidden("account is banned".to_owned()));
  }

  let password_hash = user.password.unwrap_or(String::new());

  match verify_password(&password, &password_hash)? {
    true => {
      info!(
        id=%user.id,
        account=%user.account,
        nickname=%user.nickname,
        email=%user.email.unwrap_or_default(),
        "user logged in with basic auth (oneshot)",
      );
      // NOTE: clear login attempts on successful login
      cache.at("login").del(&account).await.ok();

      let token = Token {
        id: user.id,
        account: user.account,
        nickname: user.nickname,
        permissions: user.permissions,
        // NOTE: expires immediately here, only oneshot
        exp: Utc::now().timestamp(),
      };
      let token_tracker = TokenTracker {
        token: Arc::new(Mutex::new(token.clone())),
        renew_requested: Arc::new(AtomicBool::new(false)),
        original: None,
      };
      Ok((token, token_tracker))
    }
    false => {
      // NOTE: record login attempts on failed login
      cache.at("login").incr(&account).await.ok();
      cache.at("login").expire(&account, 60 * 30).await.ok();
      warn!(id=%user.id, account=%user.account, nickname=%user.nickname, "wrong password");
      Err(ResponseError::Forbidden(
        "account or password is wrong".to_owned(),
      ))
    }
  }
}

pub async fn extract_user_info(
  State(ref database): State<Database>, State(ref mut cache): State<Cache>,
  Extension(config): Extension<config::Model>, mut req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
  let auth_config = config
    .auth
    .clone()
    .ok_or(ResponseError::InternalServerError(
      "auth config missing".into(),
    ))
    .inspect_err(|err| error!(error=?err, "auth config missing"))?;
  let auth_header = req
    .headers()
    .get(header::AUTHORIZATION)
    .and_then(|header| header.to_str().ok());

  let token_str = if let Some(auth_header) = auth_header {
    auth_header.trim()
  } else {
    ""
  };

  let method = token_str.split_whitespace().next();
  let (token, token_tracker) = match method {
    Some("Bearer") => extract_bearer_token(&auth_config, cache, token_str).await?,
    Some("Basic") => extract_basic_token(database, cache, token_str).await?,
    Some(_) => {
      return Err(ResponseError::Unauthorized(
        "unsupported auth method".to_owned(),
      ));
    }
    None => (
      Token::default(),
      TokenTracker {
        token: Arc::new(Mutex::new(Token::default())),
        renew_requested: Arc::new(AtomicBool::new(false)),
        original: None,
      },
    ),
  };

  req.extensions_mut().insert(token_tracker.clone());
  req.extensions_mut().insert(token.clone());

  Span::current().record("user-id", token.id);
  Span::current().record("user-account", token.account.as_str());
  Span::current().record("user-nickname", token.nickname.as_str());

  let mut resp = next.run(req).await;

  if token_tracker
    .renew_requested
    .load(std::sync::atomic::Ordering::Relaxed)
  {
    let token_stored = token_tracker.token.lock().await.clone();
    match token_tracker.original.as_ref() {
      Some(t) => {
        cache.at("token").del(t).await.ok();
        cache
          .at("token")
          .rem(format!("user-{}", token_stored.id), t)
          .await
          .ok()
      }
      None => None,
    };
    let token_str = distribute_token(
      &token_stored,
      &auth_config.signing_key,
      auth_config.expires_time,
    )
    .await?;
    cache
      .at("token")
      .set_ex(&token_str, token_stored.id, auth_config.expires_time)
      .await
      .inspect_err(|err| {
        error!(error=?err, "failed to store new token");
      })
      .ok();
    cache
      .at("token")
      .push(format!("user-{}", token_stored.id), &token_str)
      .await
      .ok();
    resp.headers_mut().insert(
      "Set-Token",
      token_str.parse().expect("failed to parse token"),
    );
  }

  Ok(resp)
}

pub async fn create_auth_header_by_user_agent(
  req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
  let req_headers = req.headers();
  let user_agent = req_headers
    .get(header::USER_AGENT)
    .and_then(|header| header.to_str().ok())
    .unwrap_or_default()
    .to_owned();

  let mut resp = next.run(req).await;
  if resp.status() == 401 {
    let resp_headers = resp.headers_mut();
    // test git, docker and curl here
    match user_agent {
      u if u.contains("git") => {
        resp_headers.insert(
          WWW_AUTHENTICATE,
          header::HeaderValue::from_static("Basic realm=\"ret2shell\""),
        );
      }
      u if u.contains("docker") || u.contains("containers") => {
        resp_headers.insert(
          WWW_AUTHENTICATE,
          header::HeaderValue::from_static("Basic realm=\"ret2shell\""),
        );
      }
      u if u.contains("curl") => {
        resp_headers.insert(
          WWW_AUTHENTICATE,
          header::HeaderValue::from_static("Bearer realm=\"ret2shell\""),
        );
        resp_headers.insert(
          WWW_AUTHENTICATE,
          header::HeaderValue::from_static("Basic realm=\"ret2shell\""),
        );
      }
      _ => {}
    }
  }

  Ok(resp)
}

macro_rules! captcha_protected {
  ($cache:expr, $id:expr, $answer:expr) => {
    let captcha_id = $id;
    let captcha_answer = $answer;
    let captcha = $cache
      .at("captcha")
      .getdel::<r2s_captcha::Captcha>(captcha_id)
      .await?;
    if captcha.is_none() {
      return Err(ResponseError::Gone("captcha is outdate".to_owned()));
    }
    let captcha = captcha.unwrap();
    if !r2s_captcha::check(&captcha.validator, &captcha, captcha_answer).await? {
      tracing::warn!(?captcha_id, "invalid captcha answer");
      return Err(ResponseError::Forbidden("hey robot".to_owned()));
    }
  };
}

pub(crate) use captcha_protected;

#[allow(unused_macros)]
/// Construct a middleware closure that validate permissions from token.
///
/// all the permissions appeared here should be in the `permissions` field in
/// user's token.
///
/// Usage:
///
/// ```ignore
/// Router::new()
///     .route(...)
///     .route_layer(axum::middleware::from_fn(permission_required_all!(Permission::Basic, ...)))
/// ```
macro_rules! permission_required_all {
    ($($perm:expr),*) => {
        |
            axum::extract::Extension(token): axum::extract::Extension<crate::middleware::auth::Token>,
            req: axum::extract::Request,
            next: axum::middleware::Next,
        | async move {
            if token.id <= 0 {
                return Err(crate::traits::ResponseError::Unauthorized("please login first".to_owned()));
            }
            let required_perms = [$($perm),*];
            match required_perms.iter().all(|perm| token.permissions.0.contains(perm)) {
                true => Ok(next.run(req).await),
                false => {
                  tracing::warn!(
                    "user wants to access api without permission",
                  );
                  Err(crate::traits::ResponseError::Forbidden("permission denied".to_owned(),))
                }
            }
        }
    };
}

#[allow(unused_macros)]
/// Construct a middleware closure that validate permissions from token.
///
/// all the permissions appeared here should be in the `permissions` field in
/// user's token.
///
/// Usage:
///
/// ```ignore
/// Router::new()
///     .route(...)
///     .route_layer(axum::middleware::from_fn(permission_required_any!(Permission::Basic, ...)))
/// ```
macro_rules! permission_required_any {
    ($($perm:expr),*) => {
        |
            axum::extract::Extension(token): axum::extract::Extension<crate::middleware::auth::Token>,
            req: axum::extract::Request,
            next: axum::middleware::Next,
        | async move {
            if token.id <= 0 {
                return Err(crate::traits::ResponseError::Unauthorized("please login first".to_owned()));
            }
            let required_perms = [$($perm),*];
            match required_perms.iter().any(|perm| token.permissions.0.contains(perm)) {
                true => Ok(next.run(req).await),
                false => {
                  tracing::warn!(
                    "user wants to access api without permission",
                  );
                  Err(crate::traits::ResponseError::Forbidden("permission denied".to_owned(),))
                }
            }
        }
    };
}

#[allow(unused_imports)]
pub(crate) use permission_required_all;
#[allow(unused_imports)]
pub(crate) use permission_required_any;

use super::data::extract_team;

macro_rules! is_game_admin {
  ($token:expr, $game:expr) => {{ $token.permissions.0.contains(&Permission::Game) && $game.admins.0.contains(&$token.id) }};
}

pub(crate) use is_game_admin;

pub async fn game_admin_required(
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>, req: Request,
  next: Next,
) -> Result<impl IntoResponse, ResponseError> {
  if token.id <= 0 {
    return Err(ResponseError::Unauthorized("please login first".to_owned()));
  }
  if is_game_admin!(token, game) {
    Ok(next.run(req).await)
  } else {
    warn!("user wants to access game admin api without permission",);
    Err(ResponseError::Forbidden("permission denied".to_owned()))
  }
}

pub async fn game_access_required(
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  team_ext: Extension<Option<team::Model>>, req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
  if token.id <= 0 {
    return Err(ResponseError::Unauthorized("please login first".to_owned()));
  }
  if is_game_admin!(token, game) {
    return Ok(next.run(req).await);
  }
  if game.hidden {
    warn!("user wants to access hidden game api",);
    return Err(ResponseError::Forbidden("permission denied".to_owned()));
  }
  if game.host_type == game::HostType::Training {
    return Ok(next.run(req).await);
  }
  if game.archive_at < Utc::now() {
    return Ok(next.run(req).await);
  }

  let team = if let Extension(Some(team)) = team_ext {
    Some(team)
  } else {
    None
  };

  if team.is_none() || team.is_some_and(|team| team.state == team::State::Banned) {
    warn!("user wants to access game api without participation or banned",);
    return Err(ResponseError::Forbidden("permission denied".to_owned()));
  }
  Ok(next.run(req).await)
}

pub async fn challenge_access_required(
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>, team_ext: Extension<Option<team::Model>>,
  req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
  if token.id <= 0 {
    return Err(ResponseError::Unauthorized("please login first".to_owned()));
  }
  if game.id != challenge.game_id {
    warn!("user wants to access cross-game challenge");
    return Err(ResponseError::Forbidden("permission denied".to_owned()));
  }
  if is_game_admin!(token, game) {
    return Ok(next.run(req).await);
  }
  if game.hidden
    || challenge.hidden
    || game.frozen
    || challenge.release_at.is_some_and(|c| c > Utc::now())
  {
    warn!("user wants to access hidden or unreleased challenge",);
    return Err(ResponseError::Forbidden("permission denied".to_owned()));
  }
  if game.start_at > Utc::now() {
    return Err(ResponseError::PreconditionFailed(
      "game has not started".to_owned(),
    ));
  }
  let _team = extract_team!(game, team_ext, token);
  Ok(next.run(req).await)
}

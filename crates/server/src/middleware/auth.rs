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

#[cfg(test)]
mod tests {
  use axum::{
    Extension, Router,
    body::Body,
    http::{Request, StatusCode},
    middleware::from_fn,
    response::IntoResponse,
    routing::get,
  };
  use chrono::{Duration, Utc};
  use jsonwebtoken::{EncodingKey, Header, encode};
  use r2s_database::{
    challenge, game, team,
    user::{Permission, Permissions},
  };
  use tower::ServiceExt;

  use super::{
    Token, challenge_access_required, create_auth_header_by_user_agent, decode_token,
    game_access_required, game_admin_required,
  };

  const TEST_SIGNING_KEY: &str = "unit-test-signing-key";

  fn token_with_permissions(id: i64, permissions: &[Permission]) -> Token {
    Token {
      id,
      account: format!("user-{id}"),
      nickname: format!("User {id}"),
      permissions: Permissions(permissions.to_vec()),
      exp: Utc::now().timestamp() + 3600,
    }
  }

  fn in_progress_game(host_type: game::HostType) -> game::Model {
    let now = Utc::now();
    game::Model {
      id: 1,
      updated_at: now,
      name: "test game".to_owned(),
      brief: "brief".to_owned(),
      introduction_id: None,
      start_at: now - Duration::hours(1),
      end_at: now + Duration::hours(1),
      register_at: now - Duration::days(1),
      archive_at: now + Duration::days(1),
      hidden: false,
      offline: false,
      frozen: false,
      host_type,
      team_size: 4,
      env_limit: None,
      access_policy: game::AccessPolicy {
        restrict: false,
        institutes: vec![],
        sync: 0,
      },
      archive_policy: game::ArchivePolicy::default(),
      hammer_policy: game::HammerPolicy::default(),
      cover: None,
      logo: None,
      enable_audit: false,
      can_register_after_started: false,
      award_rate: 100,
      award_rates: None,
      admins: game::Admins(vec![]),
      weight: 0,
      bucket: None,
      token: None,
      timeline_presets: None,
      node_selector: None,
      traffic: None,
      lifecycle: None,
    }
  }

  fn sample_challenge(game_id: i64) -> challenge::Model {
    challenge::Model {
      game_id,
      // `Tag` fields are private, an empty default tag is enough here.
      tag: challenge::TagList(vec![challenge::Tag::default()]),
      score_rule: challenge::ScoreRule {
        initial: 1000,
        minimum: 100,
        decay: 25,
      },
      content: Some("find the flag".to_owned()),
      ..Default::default()
    }
  }

  fn team_with_state(game_id: i64, state: team::State) -> team::Model {
    team::Model {
      game_id,
      state,
      name: "team".to_owned(),
      ..Default::default()
    }
  }

  async fn run(router: Router, user_agent: Option<&str>) -> axum::http::Response<axum::body::Body> {
    let mut builder = Request::builder().uri("/");
    if let Some(user_agent) = user_agent {
      builder = builder.header("user-agent", user_agent);
    }
    router
      .oneshot(builder.body(Body::empty()).unwrap())
      .await
      .unwrap()
  }

  async fn run_game_admin(token: Token, game: game::Model) -> StatusCode {
    run(
      Router::new()
        .route("/", get(|| async { "ok" }))
        .layer(from_fn(game_admin_required))
        .layer(Extension(game))
        .layer(Extension(token)),
      None,
    )
    .await
    .status()
  }

  async fn run_game_access(
    token: Token, game: game::Model, team: Option<team::Model>,
  ) -> StatusCode {
    run(
      Router::new()
        .route("/", get(|| async { "ok" }))
        .layer(from_fn(game_access_required))
        .layer(Extension(team))
        .layer(Extension(game))
        .layer(Extension(token)),
      None,
    )
    .await
    .status()
  }

  async fn run_challenge_access(
    token: Token, game: game::Model, challenge: challenge::Model, team: Option<team::Model>,
  ) -> StatusCode {
    run(
      Router::new()
        .route("/", get(|| async { "ok" }))
        .layer(from_fn(challenge_access_required))
        .layer(Extension(team))
        .layer(Extension(challenge))
        .layer(Extension(game))
        .layer(Extension(token)),
      None,
    )
    .await
    .status()
  }

  #[tokio::test]
  async fn game_admin_gate_rejects_anonymous_and_non_admins_but_admits_admins() {
    let game = in_progress_game(game::HostType::Game);

    assert_eq!(
      run_game_admin(Token::default(), game.clone()).await,
      StatusCode::UNAUTHORIZED
    );
    assert_eq!(
      run_game_admin(
        token_with_permissions(2, &[Permission::Basic]),
        game.clone()
      )
      .await,
      StatusCode::FORBIDDEN
    );

    let mut admin_game = game;
    admin_game.admins = game::Admins(vec![7]);
    assert_eq!(
      run_game_admin(token_with_permissions(7, &[Permission::Game]), admin_game).await,
      StatusCode::OK
    );
  }

  #[tokio::test]
  async fn game_access_gate_hides_games_from_non_participants() {
    let player = || token_with_permissions(2, &[Permission::Basic]);

    assert_eq!(
      run_game_access(
        Token::default(),
        in_progress_game(game::HostType::Game),
        None
      )
      .await,
      StatusCode::UNAUTHORIZED
    );

    let mut hidden = in_progress_game(game::HostType::Game);
    hidden.hidden = true;
    assert_eq!(
      run_game_access(player(), hidden, None).await,
      StatusCode::FORBIDDEN
    );
    assert_eq!(
      run_game_access(player(), in_progress_game(game::HostType::Training), None).await,
      StatusCode::OK
    );

    let mut archived = in_progress_game(game::HostType::Game);
    archived.archive_at = Utc::now() - Duration::hours(2);
    assert_eq!(
      run_game_access(player(), archived, None).await,
      StatusCode::OK
    );

    let active = in_progress_game(game::HostType::Game);
    assert_eq!(
      run_game_access(player(), active.clone(), None).await,
      StatusCode::FORBIDDEN
    );
    assert_eq!(
      run_game_access(
        player(),
        active.clone(),
        Some(team_with_state(1, team::State::Banned))
      )
      .await,
      StatusCode::FORBIDDEN
    );
    assert_eq!(
      run_game_access(
        player(),
        active,
        Some(team_with_state(1, team::State::Passed))
      )
      .await,
      StatusCode::OK
    );
  }

  #[tokio::test]
  async fn game_access_gate_always_admits_game_admins() {
    let mut game = in_progress_game(game::HostType::Game);
    game.hidden = true;
    game.admins = game::Admins(vec![7]);
    assert_eq!(
      run_game_access(token_with_permissions(7, &[Permission::Game]), game, None).await,
      StatusCode::OK
    );
  }

  #[tokio::test]
  async fn challenge_access_gate_blocks_cross_game_and_unreleased_challenges() {
    let player = || token_with_permissions(2, &[Permission::Basic]);

    assert_eq!(
      run_challenge_access(
        Token::default(),
        in_progress_game(game::HostType::Game),
        sample_challenge(1),
        None
      )
      .await,
      StatusCode::UNAUTHORIZED
    );
    assert_eq!(
      run_challenge_access(
        player(),
        in_progress_game(game::HostType::Game),
        sample_challenge(999),
        None
      )
      .await,
      StatusCode::FORBIDDEN
    );
  }

  #[tokio::test]
  async fn challenge_access_gate_hides_challenges_until_released_and_started() {
    let player = || token_with_permissions(2, &[Permission::Basic]);

    let mut hidden = sample_challenge(1);
    hidden.hidden = true;
    assert_eq!(
      run_challenge_access(
        player(),
        in_progress_game(game::HostType::Game),
        hidden,
        None
      )
      .await,
      StatusCode::FORBIDDEN
    );

    let mut frozen = in_progress_game(game::HostType::Game);
    frozen.frozen = true;
    assert_eq!(
      run_challenge_access(player(), frozen, sample_challenge(1), None).await,
      StatusCode::FORBIDDEN
    );

    let mut unreleased = sample_challenge(1);
    unreleased.release_at = Some(Utc::now() + Duration::hours(1));
    assert_eq!(
      run_challenge_access(
        player(),
        in_progress_game(game::HostType::Game),
        unreleased,
        None
      )
      .await,
      StatusCode::FORBIDDEN
    );

    let mut not_started = in_progress_game(game::HostType::Game);
    not_started.start_at = Utc::now() + Duration::hours(1);
    not_started.end_at = Utc::now() + Duration::hours(2);
    assert_eq!(
      run_challenge_access(player(), not_started, sample_challenge(1), None).await,
      StatusCode::PRECONDITION_FAILED
    );
  }

  #[tokio::test]
  async fn challenge_access_gate_requires_participation_in_live_games() {
    let player = || token_with_permissions(2, &[Permission::Basic]);
    let active = in_progress_game(game::HostType::Game);

    assert_eq!(
      run_challenge_access(player(), active.clone(), sample_challenge(1), None).await,
      StatusCode::FORBIDDEN
    );
    assert_eq!(
      run_challenge_access(
        player(),
        active,
        sample_challenge(1),
        Some(team_with_state(1, team::State::Passed)),
      )
      .await,
      StatusCode::OK
    );
  }

  #[tokio::test]
  async fn challenge_access_gate_always_admits_game_admins() {
    let mut game = in_progress_game(game::HostType::Game);
    game.admins = game::Admins(vec![7]);
    let mut hidden = sample_challenge(1);
    hidden.hidden = true;

    assert_eq!(
      run_challenge_access(
        token_with_permissions(7, &[Permission::Game]),
        game,
        hidden,
        None,
      )
      .await,
      StatusCode::OK
    );
  }

  async fn run_user_agent_probe(status: StatusCode, user_agent: &str) -> Vec<String> {
    let app = Router::new()
      .route("/", get(move || async move { status.into_response() }))
      .layer(from_fn(create_auth_header_by_user_agent));
    let response = run(app, Some(user_agent)).await;
    response
      .headers()
      .get_all("WWW-Authenticate")
      .iter()
      .map(|value| value.to_str().unwrap().to_owned())
      .collect()
  }

  #[tokio::test]
  async fn cli_user_agents_get_basic_www_authenticate_on_unauthorized() {
    for user_agent in ["git/2.42.0", "docker/24.0.7", "containers/0.1"] {
      let challenges = run_user_agent_probe(StatusCode::UNAUTHORIZED, user_agent).await;
      assert!(
        challenges.iter().any(|c| c == "Basic realm=\"ret2shell\""),
        "{user_agent} should receive a basic challenge"
      );
    }
    // NOTE: the handler intends to offer both bearer and basic challenges for
    // curl, but `HeaderMap::insert` overwrites same-name headers, so only one
    // value survives. Asserted against the actual single-value behavior.
    let challenges = run_user_agent_probe(StatusCode::UNAUTHORIZED, "curl/8.0").await;
    assert!(challenges.contains(&"Basic realm=\"ret2shell\"".to_owned()));
  }

  #[tokio::test]
  async fn successful_responses_and_other_agents_receive_no_challenge() {
    for user_agent in ["git/2.42.0", "Mozilla/5.0"] {
      let challenges = run_user_agent_probe(StatusCode::INTERNAL_SERVER_ERROR, user_agent).await;
      assert!(challenges.is_empty());
    }
    let challenges = run_user_agent_probe(StatusCode::UNAUTHORIZED, "Mozilla/5.0").await;
    assert!(challenges.is_empty());
  }

  fn encoded_token(token: &Token) -> String {
    encode(
      &Header::default(),
      token,
      &EncodingKey::from_secret(TEST_SIGNING_KEY.as_bytes()),
    )
    .unwrap()
  }

  #[tokio::test]
  async fn decode_token_round_trips_signed_tokens() {
    let token = token_with_permissions(42, &[Permission::Basic, Permission::Game]);

    let decoded = decode_token(&encoded_token(&token), TEST_SIGNING_KEY).await;

    assert_eq!(decoded.id, 42);
    assert_eq!(decoded.account, token.account);
    assert_eq!(decoded.nickname, token.nickname);
    assert_eq!(decoded.permissions, token.permissions);
    assert_eq!(decoded.exp, token.exp);
  }

  fn assert_default_token(token: &Token) {
    assert_eq!(token.id, 0);
    assert!(token.account.is_empty());
    assert!(token.nickname.is_empty());
    assert!(token.permissions.0.is_empty());
    assert_eq!(token.exp, 0);
  }

  #[tokio::test]
  async fn decode_token_falls_back_to_default_for_garbage_or_expired_tokens() {
    assert_default_token(&decode_token("not-a-jwt", TEST_SIGNING_KEY).await);

    let mut expired = token_with_permissions(42, &[Permission::Basic]);
    expired.exp = Utc::now().timestamp() - 3600;
    assert_default_token(&decode_token(&encoded_token(&expired), TEST_SIGNING_KEY).await);

    assert_default_token(
      &decode_token(
        &encoded_token(&token_with_permissions(1, &[])),
        "wrong-secret",
      )
      .await,
    );
  }
}

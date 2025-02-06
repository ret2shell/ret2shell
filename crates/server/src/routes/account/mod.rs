use std::net::IpAddr;

use axum::{
  extract::{Query, State},
  http::StatusCode,
  middleware,
  response::IntoResponse,
  routing::{get, patch, post},
  Extension, Json, Router,
};
use chrono::{serde::ts_seconds, DateTime, Utc};
use nanoid::{alphabet, nanoid};
use r2s_cache::Cache;
use r2s_config::{captcha::ValidatorType, email};
use r2s_database::{
  config, game, institute as institute_db, team,
  user::{self, Permission, Permissions},
};
use r2s_email::{EmailCtx, EmailRequest};
use r2s_migrator::Database;
use r2s_queue::Queue;
use rand::Rng;
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use crate::{
  middleware::{
    auth::{captcha_protected, permission_required_all, Token, TokenTracker},
    data,
  },
  traits::{GlobalState, ResponseError},
  utility::password::{hash_password, verify_password},
};

mod captcha;
mod institute;
mod oauth;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .route("/code", get(get_account_code).post(generate_account_code))
    .route_layer(middleware::from_fn(permission_required_all!(
      Permission::Verified
    )))
    .route(
      "/profile",
      get(get_profile).patch(change_profile).delete(delete_self),
    )
    .route("/verify", patch(resend_verify_email))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      data::prepare_user_info,
    ))
    .route("/password", patch(change_password))
    .route("/logout", post(logout))
    .route_layer(middleware::from_fn(permission_required_all!(
      Permission::Basic
    )))
    .nest("/oauth", oauth::router(state))
    .route("/verify", post(verify_email))
    .route("/reset", post(reset_password))
    .route("/forgot", post(forgot_password))
    .route("/login", post(login))
    .route("/register", post(register))
    .route(
      "/query",
      get(query_code_for_account)
        .post(bind_account_by_code)
        .delete(unbind_account_by_code),
    )
    .nest("/captcha", captcha::router(state))
    .nest("/institute", institute::router(state))
}

macro_rules! get_user_by_account {
  ($db:expr, $account:expr) => {{
    let user = user::get_by_account_or_email(&$db.conn, $account).await?;
    let user = match user {
      Some(user) => user,
      None => {
        return Err(ResponseError::Forbidden(
          "account or password is wrong".to_owned(),
          format!("user requested account {} does not exist", $account),
        ));
      }
    };
    user
  }};
}

macro_rules! check_email_freq {
  ($cache:expr, $email:expr) => {{
    let freq: Option<i64> = $cache.at("email").get($email).await?;

    if let Some(freq) = freq {
      if freq > 3 {
        return Err(ResponseError::TooManyRequests(
          "too many requests, please try again later".to_owned(),
          format!("email {} has been requested too many times", $email),
        ));
      }
    }

    $cache.at("email").incr($email).await?;
    $cache.at("email").expire($email, 30 * 60).await?;
  }};
}

macro_rules! check_email_validation {
  ($cache:expr, $token:expr, $email:expr) => {{
    let checked_email = $cache.at("email").get($token).await?;
    let checked_email: String = match checked_email {
      Some(email) => email,
      None => {
        return Err(ResponseError::NotFound("token not found".to_owned()));
      }
    };

    if &checked_email != $email {
      return Err(ResponseError::BadRequest("email not match".to_owned()));
    }
    checked_email
  }};
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

#[derive(Serialize, Deserialize)]
struct CodeWithTime {
  pub code: u64,
  #[serde(with = "ts_seconds")]
  pub generate_at: DateTime<Utc>,
}

async fn get_account_code(
  State(cache): State<Cache>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  let code: Option<CodeWithTime> = cache.at("account-code").get(token.id).await?;
  Ok(Json(code))
}

async fn generate_account_code(
  State(cache): State<Cache>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  if let Some(code) = cache
    .at("account-code")
    .get::<CodeWithTime>(token.id)
    .await?
  {
    cache.at("account-code-rev").del(code.code).await.ok();
  }
  let mut code: u64 = rand::rng().random_range(0..=0xFF_FFFF);
  while cache
    .at("account-code-rev")
    .get::<i64>(code)
    .await?
    .is_some()
  {
    code = rand::rng().random_range(0..=0xFF_FFFF);
  }
  let resp = CodeWithTime {
    code,
    generate_at: Utc::now(),
  };
  cache
    .at("account-code")
    .set_ex(token.id, &resp, 300)
    .await?;
  cache
    .at("account-code-rev")
    .set_ex(code, token.id, 300)
    .await?;
  Ok(Json(resp))
}

#[derive(Deserialize)]
struct CodeQuery {
  pub code: u64,
}

async fn query_code_for_account(
  State(db): State<Database>, State(cache): State<Cache>,
  Query(CodeQuery { code }): Query<CodeQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let user_id: Option<i64> = cache.at("account-code-rev").getdel(code).await?;
  if let Some(user_id) = user_id {
    cache.at("account-code").del(user_id).await.ok();
    if let Some(user) = user::get_ex(&db.conn, user_id).await? {
      Ok(Json(user))
    } else {
      Err(ResponseError::NotFound("user not found".to_owned()))
    }
  } else {
    Err(ResponseError::NotFound("user not found".to_owned()))
  }
}

async fn bind_account_by_code(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(token_tracker): Extension<TokenTracker>, Extension(ip): Extension<IpAddr>,
  Query(CodeQuery { code }): Query<CodeQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let original = match token_tracker.original.clone() {
    Some(token) => token,
    None => {
      return Err(ResponseError::Forbidden(
        "permission denied".to_owned(),
        format!("client {} has no permission to bind account", ip),
      ));
    }
  };
  let institute = match institute_db::get_by_token(&db.conn, &original).await? {
    Some(institute) => institute,
    None => {
      return Err(ResponseError::Forbidden(
        "permission denied".to_owned(),
        format!("client {} has no permission to bind account", ip),
      ));
    }
  };
  let user_id: Option<i64> = cache.at("account-code-rev").getdel(code).await?;
  if let Some(user_id) = user_id {
    cache.at("account-code").del(user_id).await.ok();
    if let Some(user) = user::get_ex(&db.conn, user_id).await? {
      if user.institute_id.is_some_and(|v| v == institute.id) {
        return Ok((StatusCode::ALREADY_REPORTED, Json(user)));
      } else if user.institute_id.is_some() {
        return Err(ResponseError::Conflict("account already bound".to_owned()));
      }
      let user = user::Model {
        institute_id: Some(institute.id),
        ..user.into()
      };
      let mut user: user::ExModel = user::update(&db.conn, user).await?.into();
      user.institute_name = Some(institute.name);
      Ok((StatusCode::OK, Json(user)))
    } else {
      Err(ResponseError::NotFound("user not found".to_owned()))
    }
  } else {
    Err(ResponseError::NotFound("user not found".to_owned()))
  }
}

async fn unbind_account_by_code(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(token_tracker): Extension<TokenTracker>, Extension(ip): Extension<IpAddr>,
  Query(CodeQuery { code }): Query<CodeQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let original = match token_tracker.original.clone() {
    Some(token) => token,
    None => {
      return Err(ResponseError::Forbidden(
        "permission denied".to_owned(),
        format!("client {} has no permission to bind account", ip),
      ));
    }
  };
  let institute = match institute_db::get_by_token(&db.conn, &original).await? {
    Some(institute) => institute,
    None => {
      return Err(ResponseError::Forbidden(
        "permission denied".to_owned(),
        format!("client {} has no permission to bind account", ip),
      ));
    }
  };
  let user_id: Option<i64> = cache.at("account-code-rev").getdel(code).await?;
  if let Some(user_id) = user_id {
    cache.at("account-code").del(user_id).await.ok();
    if let Some(mut user) = user::get_ex(&db.conn, user_id).await? {
      if user.institute_id.is_some_and(|v| v != institute.id) {
        return Err(ResponseError::Forbidden(
          "permission denied".to_owned(),
          format!("client {} has no permission to unbind account", ip),
        ));
      }
      user.institute_id = None;
      let user: user::ExModel = user::update(&db.conn, user.into()).await?.into();
      Ok(Json(user))
    } else {
      Err(ResponseError::NotFound("user not found".to_owned()))
    }
  } else {
    Err(ResponseError::NotFound("user not found".to_owned()))
  }
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginRequest {
  pub account: String,
  pub password: String,
  pub captcha_id: String,
  pub captcha_answer: String,
}

async fn login(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>, Extension(token): Extension<Token>,
  Extension(token_tracker): Extension<TokenTracker>, Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  debug!("login request: {:?}", body);
  if token.id > 0 {
    return Err(ResponseError::Conflict(
      "you have already logged in".to_owned(),
    ));
  }
  if config
    .captcha
    .is_some_and(|c| c.enabled && c.validator != ValidatorType::None)
  {
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);
  }
  let user = get_user_by_account!(db, &body.account);

  if user.banned || !user.permissions.0.contains(&Permission::Basic) {
    return Err(ResponseError::Forbidden(
      "account is banned".to_owned(),
      format!(
        "user {}:'{}' ({}) is banned",
        user.id, user.account, user.nickname
      ),
    ));
  }

  let password_hash = user.password.unwrap_or(String::new());

  match verify_password(&body.password, &password_hash)? {
    true => {
      info!(
        "User logged in: {}:'{}' ({}) <{}>",
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

      // NOTE: update user's password hash if it's not argon2
      if !password_hash.starts_with("$argon2") {
        if let Ok(password) = hash_password(&body.password).map_err(|err| {
          warn!("failed to hash password: {:?}", err);
        }) {
          user::update_password(&db.conn, user.id, password).await?;
        }
      }

      Ok(StatusCode::OK)
    }
    false => Err(ResponseError::Forbidden(
      "account or password is wrong".to_owned(),
      format!("user {} password is wrong", user.id),
    )),
  }
}

enum EmailType {
  Verify,
  Reset,
}

async fn send_email(
  cache: &Cache, queue: &Queue, config: &config::Model, account: &str, email: &str,
  email_type: EmailType,
) -> Result<(), ResponseError> {
  let email_config = match config.email.clone() {
    Some(email::Config { enabled: false, .. }) => {
      return Ok(());
    }
    Some(email_config) => email_config,
    None => {
      return Ok(());
    }
  };
  let verification_id = nanoid!(21, &alphabet::SAFE);
  cache
    .at("email")
    .set_ex(&verification_id, &email, 24 * 60 * 60)
    .await?;

  let verify_email_subject = email_config
    .verify_email_subject
    .clone()
    .unwrap_or("Verify your account - Ret2Shell".to_owned());
  let reset_password_subject = email_config
    .reset_password_email_subject
    .clone()
    .unwrap_or("Reset your password - Ret2Shell".to_owned());
  let verify_email_body = email_config
    .verify_email_body
    .clone()
    .unwrap_or(include_str!("./verify-email.html").to_owned());
  let reset_password_body = email_config
    .reset_password_email_body
    .clone()
    .unwrap_or(include_str!("./reset-password.html").to_owned());
  let (subject, body) = match email_type {
    EmailType::Verify => (verify_email_subject, verify_email_body),
    EmailType::Reset => (reset_password_subject, reset_password_body),
  };

  let link = match email_type {
    EmailType::Verify => format!(
      "{}/account/verify?email={}&token={}",
      config.server.as_ref().unwrap().external_origin(),
      email,
      verification_id
    ),
    EmailType::Reset => format!(
      "{}/account/reset?email={}&token={}",
      config.server.as_ref().unwrap().external_origin(),
      email,
      verification_id
    ),
  };

  let email_req = EmailRequest {
    email: EmailCtx {
      name: account.to_owned(),
      email: email.to_owned(),
      subject,
      content: body.replace("%LINK%", &link).replace("%USER%", account),
    },
    // unwrap is safe here because we have checked the config in the previous if statement
    config: config.email.as_ref().unwrap().to_owned(),
  };
  queue.publish("email", email_req).await?;
  Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct RegisterRequest {
  pub account: String,
  pub nickname: String,
  pub email: String,
  pub password: String,
  pub captcha_id: String,
  pub captcha_answer: String,
}

async fn register(
  State(ref db): State<Database>, State(cache): State<Cache>, State(ref queue): State<Queue>,
  Extension(config): Extension<config::Model>, Extension(token_tracker): Extension<TokenTracker>,
  Json(body): Json<RegisterRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  debug!("register request: {:?}", body);
  let txn = db.conn.begin().await?;
  if config
    .captcha
    .clone()
    .is_some_and(|c| c.enabled && c.validator != ValidatorType::None)
  {
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);
  }

  // if user::get_user_by_account(db, &body.email).await.is_ok() {
  //     return Err((StatusCode::CONFLICT, "account already exists"));
  // }
  if user::get_by_account_or_email(&txn, &body.email)
    .await?
    .is_some()
    || user::get_by_account_or_email(&txn, &body.account)
      .await?
      .is_some()
  {
    return Err(ResponseError::Conflict("account already exists".to_owned()));
  }

  let password = hash_password(&body.password)?;

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
  let email = body.email.clone();
  let new_user = user::Model {
    account: body.account.clone(),
    nickname: body.nickname.clone(),
    password: Some(password),
    email: Some(body.email),
    registered_at: Utc::now(),
    permissions,
    hidden: false,
    banned: false,
    ..Default::default()
  };

  let user = user::create(&txn, new_user).await?;

  txn.commit().await?;

  send_email(
    &cache,
    queue,
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

  Ok(StatusCode::OK)
}

#[derive(Deserialize)]
struct VerifyEmailRequest {
  pub email: String,
  pub token: String,
}

async fn verify_email(
  State(cache): State<Cache>, State(db): State<Database>,
  Extension(token_tracker): Extension<TokenTracker>, Json(body): Json<VerifyEmailRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let checked_email = check_email_validation!(cache, &body.token, &body.email);

  let mut user = get_user_by_account!(db, &checked_email);

  if user.permissions.0.contains(&Permission::Verified) {
    return Err(ResponseError::Conflict("user already verified".to_owned()));
  }
  user.permissions.0.push(Permission::Verified);

  user::update(&db.conn, user.clone()).await?;

  info!(
    "User verified: {} ({}) <{}>",
    user.account,
    user.nickname,
    user.email.unwrap_or_default()
  );
  logout_user(&cache, user.id).await?;
  // renew token
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

  Ok(StatusCode::OK)
}

async fn resend_verify_email(
  State(cache): State<Cache>, State(ref queue): State<Queue>,
  Extension(config): Extension<config::Model>, Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if user.permissions.0.contains(&Permission::Verified) {
    return Err(ResponseError::Conflict("user already verified".to_owned()));
  }

  let email = match user.email.clone() {
    Some(email) => email,
    None => {
      return Err(ResponseError::NotFound(
        "this account does not have email".to_owned(),
      ));
    }
  };

  check_email_freq!(cache, &email);

  send_email(
    &cache,
    queue,
    &config,
    &user.account,
    &email,
    EmailType::Verify,
  )
  .await?;
  Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
struct ForgotPasswordRequest {
  pub email: String,
  pub captcha_id: String,
  pub captcha_answer: String,
}

async fn forgot_password(
  State(cache): State<Cache>, State(db): State<Database>, State(ref queue): State<Queue>,
  Extension(config): Extension<config::Model>, Json(body): Json<ForgotPasswordRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if config
    .captcha
    .clone()
    .is_some_and(|c| c.enabled && c.validator != ValidatorType::None)
  {
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);
  }
  let user = user::get_by_account_or_email(&db.conn, &body.email).await?;
  let user = match user {
    Some(u) => u,
    None => {
      warn!("user not found: {}", body.email);
      // shadowing the error to prevent leaking user information
      //return Err(ResponseError::NotFound("user not found".to_owned()));
      return Ok(StatusCode::OK);
    }
  };

  check_email_freq!(cache, &body.email);

  send_email(
    &cache,
    queue,
    &config,
    &user.account,
    &body.email,
    EmailType::Reset,
  )
  .await?;
  Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
struct ResetPasswordRequest {
  pub email: String,
  pub password: String,
  pub token: String,
  pub captcha_id: String,
  pub captcha_answer: String,
}

async fn reset_password(
  State(cache): State<Cache>, State(ref db): State<Database>,
  Extension(config): Extension<config::Model>, Json(body): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if config
    .captcha
    .clone()
    .is_some_and(|c| c.enabled && c.validator != ValidatorType::None)
  {
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);
  }

  let checked_email = check_email_validation!(cache, &body.token, &body.email);

  let user = user::get_by_account_or_email(&db.conn, &checked_email).await?;
  let user = match user {
    Some(u) => u,
    None => {
      return Err(ResponseError::NotFound("user not found".to_owned()));
    }
  };

  let password = hash_password(&body.password)?;
  user::update_password(&db.conn, user.id, password).await?;
  let mut prev_token: Option<String>;
  loop {
    prev_token = cache.at("token").pop(format!("user-{}", user.id)).await?;
    if prev_token.is_none() {
      break;
    }
    cache.at("token").del(&prev_token.unwrap()).await.ok();
  }
  cache.at("token").del(format!("user-{}", user.id)).await?;
  Ok(())
}

#[derive(Deserialize)]
struct ChangePasswordRequest {
  pub old_password: String,
  pub new_password: String,
}

async fn change_password(
  State(ref db): State<Database>, State(cache): State<Cache>, Extension(token): Extension<Token>,
  Json(body): Json<ChangePasswordRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let user = user::get(&db.conn, token.id).await?;
  let user = match user {
    Some(u) => u,
    None => {
      return Err(ResponseError::NotFound("user not found".to_owned()));
    }
  };

  let password_hash = user.password.unwrap_or_default();
  match verify_password(&body.old_password, &password_hash)? {
    true => {
      let password = hash_password(&body.new_password)?;
      user::update_password(&db.conn, user.id, password).await?;
      while let Some(token_str) = cache
        .at("token")
        .pop::<String>(format!("user-{}", user.id))
        .await?
      {
        cache.at("token").del(&token_str).await.ok();
      }
      cache.at("token").del(format!("user-{}", user.id)).await?;
      Ok(StatusCode::OK)
    }
    false => Err(ResponseError::Forbidden(
      "old password is wrong".to_owned(),
      format!("user {} password is wrong", user.id),
    )),
  }
}

async fn logout(
  State(cache): State<Cache>, Extension(token): Extension<Token>,
  Extension(token_tracker): Extension<TokenTracker>,
) -> Result<impl IntoResponse, ResponseError> {
  debug!("logout request");
  if token.id < 0 {
    return Err(ResponseError::Conflict("you have not logged in".to_owned()));
  }
  if let Some(token_str) = token_tracker.original {
    cache.at("token").del(&token_str).await.ok();
    cache
      .at("token")
      .rem(format!("user-{}", token.id), token_str)
      .await
      .ok();
  }

  Ok(StatusCode::OK)
}

async fn get_profile(
  Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(user))
}

async fn change_profile(
  State(ref cache): State<Cache>, State(ref queue): State<Queue>, State(ref db): State<Database>,
  Extension(config): Extension<config::Model>, Extension(user): Extension<user::Model>,
  Extension(token_tracker): Extension<TokenTracker>, Json(body): Json<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let email_changed = body.email != user.email;
  let email = match body.email.clone() {
    Some(email) => email,
    None => {
      return Err(ResponseError::BadRequest("email is required".to_owned()));
    }
  };

  let user = user::Model {
    nickname: body.nickname.clone(),
    email: Some(email.clone()),
    avatar: body.avatar.clone(),
    description: body.description.clone(),
    permissions: Permissions(
      user
        .permissions
        .clone()
        .0
        .into_iter()
        .filter(|p| !(email_changed && p == &Permission::Verified))
        .collect(),
    ),
    ..user
  };

  let user = user::update(&db.conn, user).await?;
  if email_changed {
    send_email(
      cache,
      queue,
      &config,
      &body.account,
      &email,
      EmailType::Verify,
    )
    .await?;

    logout_user(cache, user.id).await?;
    // renew token
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
  }
  Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
struct DeleteSelfRequest {
  pub captcha_id: String,
  pub captcha_answer: String,
}

async fn delete_self(
  State(db): State<Database>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>, Extension(user): Extension<user::Model>,
  Json(req): Json<DeleteSelfRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if config
    .captcha
    .clone()
    .is_some_and(|c| c.enabled && c.validator != ValidatorType::None)
  {
    captcha_protected!(cache, &req.captcha_id, &req.captcha_answer);
  }
  let txn = db.conn.begin().await?;

  // Check if user is the only user
  let user_count = user::count(&txn, false, None, None, false).await?;
  if user_count == 1 {
    return Err(ResponseError::Forbidden(
      "you are the only user, can't delete yourself".to_owned(),
      format!(
        "user {}:'{}' ({}) want to delete itself but no user left.",
        user.id, user.account, user.nickname
      ),
    ));
  }

  // Check if user has participated in any in-progress game
  let games = game::get_list(&txn, Some(Utc::now()), None, None, Some(Utc::now())).await?;
  for game in games {
    if team::get_by_user_id(&txn, game.id, user.id)
      .await?
      .is_some()
    {
      return Err(ResponseError::Forbidden(
        "you can not delete account before game archived".to_owned(),
        format!(
          "user {}:'{}' ({}) want to delete itself before game {}:'{}' archived",
          user.id, user.account, user.nickname, game.id, game.name
        ),
      ));
    }
  }
  let user = user::Model {
    account: format!("[DELETED]_{}", user.id),
    nickname: format!("[DELETED]_{}", user.id),
    email: Some(format!("deleted-{}@private.ret.sh.cn", user.id)),
    description: Some(format!(
      "**[DELETED]** This account has been ~~deleted~~ at {}",
      Utc::now().to_rfc3339()
    )),
    institute_id: None,
    permissions: Permissions::default(),
    hidden: true,
    banned: true,
    avatar: None,
    ..user
  };
  let mut prev_token: Option<String>;
  loop {
    prev_token = cache.at("token").pop(format!("user-{}", user.id)).await?;
    if prev_token.is_none() {
      break;
    }
    cache.at("token").del(&prev_token.unwrap()).await.ok();
  }
  cache.at("token").del(format!("user-{}", user.id)).await?;
  r2s_database::oauth::delete_by_user_id(&txn, user.id).await?;
  user::update(&txn, user.clone()).await?;

  txn.commit().await?;
  Ok(StatusCode::OK)
}

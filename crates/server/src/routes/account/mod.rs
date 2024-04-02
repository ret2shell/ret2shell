use axum::{
    extract::State,
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::Utc;
use nanoid::{alphabet, nanoid};
use r2s_cache::Cache;
use r2s_config::email;
use r2s_database::{
    config,
    user::{self, Permission, Permissions},
};
use r2s_email::{EmailCtx, EmailRequest};
use r2s_migrator::Database;
use r2s_queue::Queue;
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

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route(
            "/profile",
            get(get_profile).patch(change_profile).delete(delete_self),
        )
        .route("/verify", post(verify_email).patch(resend_verify_email))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            data::prepare_user_info,
        ))
        .route("/logout", post(logout))
        .route_layer(middleware::from_fn(permission_required_all!(
            Permission::Basic
        )))
        .route("/reset", post(reset_password))
        .route("/forgot", post(forgot_password))
        .route("/login", post(login))
        .route("/register", post(register))
        .nest("/captcha", captcha::router(state))
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
            return Err(ResponseError::PreconditionFailed(
                "email not match".to_owned(),
            ));
        }
        checked_email
    }};
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginRequest {
    pub account: String,
    pub password: String,
    pub captcha_id: String,
    pub captcha_answer: String,
}

async fn login(
    State(ref db): State<Database>, State(cache): State<Cache>, Extension(token): Extension<Token>,
    Extension(token_tracker): Extension<TokenTracker>, Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, ResponseError> {
    debug!("login request: {:?}", body);
    if token.id >= 0 {
        return Err(ResponseError::Conflict(
            "you have already logged in".to_owned(),
        ));
    }
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);

    let user = get_user_by_account!(db, &body.account);

    if user.banned || !user.permissions.0.contains(&Permission::Basic) {
        return Err(ResponseError::Forbidden(
            "account is banned".to_owned(),
            format!(
                "user {}:{} ({}) is banned",
                user.id, user.account, user.nickname
            ),
        ));
    }

    let password_hash = user.password.unwrap_or(String::new());

    match verify_password(&body.password, &password_hash)? {
        true => {
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
    cache: &Cache, queue: &Queue, config: &config::Model, nickname: &str, email: &str,
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
        .unwrap_or(r"Hi %USER%, Please verify your account follow this link: %LINK% ".to_owned());
    let reset_password_body = email_config
        .reset_password_email_body
        .clone()
        .unwrap_or(r"Hi %USER%, Please reset your password follow this link: %LINK% ".to_owned());
    let (subject, body) = match email_type {
        EmailType::Verify => (verify_email_subject, verify_email_body),
        EmailType::Reset => (reset_password_subject, reset_password_body),
    };

    let email_req = EmailRequest {
        email: EmailCtx {
            name: nickname.to_owned(),
            email: email.to_owned(),
            subject,
            content: body
                .replace(
                    "%LINK%",
                    &format!(
                        "{}/account/verify?email={}&token={}",
                        config.server.as_ref().unwrap().external_origin(),
                        email,
                        verification_id
                    ),
                )
                .replace("%USER%", nickname),
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
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);

    // if user::get_user_by_account(db, &body.email).await.is_ok() {
    //     return Err((StatusCode::CONFLICT, "account already exists"));
    // }
    if user::get_by_account_or_email(&db.conn, &body.email)
        .await?
        .is_some()
    {
        return Err(ResponseError::Conflict("account already exists".to_owned()));
    }

    let password = hash_password(&body.password)?;

    let mut permissions = match user::count(&db.conn, true).await? {
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
    if !config.email.as_ref().is_some_and(|c| c.enabled) {
        permissions.0.push(Permission::Verified);
    }
    let email = body.email.clone();
    let new_user = user::Model {
        account: body.account.clone(),
        nickname: body.nickname.clone(),
        password: Some(password),
        email: Some(body.email),
        permissions,
        hidden: false,
        banned: false,
        ..Default::default()
    };

    let user = user::create(&db.conn, new_user).await?;

    send_email(
        &cache,
        queue,
        &config,
        &user.nickname,
        &email,
        EmailType::Verify,
    )
    .await?;
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

    // TODO: connect user and institute by email here.
    info!(
        "User verified: {} ({}) <{}>",
        user.account,
        user.nickname,
        user.email.unwrap_or_default()
    );
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
        &user.nickname,
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
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);
    let user = user::get_by_account_or_email(&db.conn, &body.email).await?;
    let user = match user {
        Some(u) => u,
        None => {
            return Err(ResponseError::NotFound("user not found".to_owned()));
        }
    };

    check_email_freq!(cache, &body.email);

    send_email(
        &cache,
        queue,
        &config,
        &user.nickname,
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
    Json(body): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, ResponseError> {
    captcha_protected!(cache, &body.captcha_id, &body.captcha_answer);

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
    Ok(Json(user.desensitize()))
}

async fn change_profile(
    State(ref cache): State<Cache>, State(ref queue): State<Queue>, State(ref db): State<Database>,
    Extension(config): Extension<config::Model>, Extension(user): Extension<user::Model>,
    Json(body): Json<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let email_changed = body.email != user.email;
    let email = match body.email.clone() {
        Some(email) => email,
        None => {
            return Err(ResponseError::PreconditionFailed(
                "email is required".to_owned(),
            ));
        }
    };

    let user = user::Model {
        nickname: body.nickname.clone(),
        email: Some(email.clone()),
        avatar: body.avatar.clone(),
        description: body.description.clone(),
        permissions: Permissions(
            user.permissions
                .clone()
                .0
                .into_iter()
                .filter(|p| !(email_changed && p == &Permission::Verified))
                .collect(),
        ),
        ..user
    };

    user::update(&db.conn, user).await?;
    if email_changed {
        send_email(
            cache,
            queue,
            &config,
            &body.nickname,
            &email,
            EmailType::Verify,
        )
        .await?;
    }
    Ok(StatusCode::OK)
}

async fn delete_self(
    State(db): State<Database>, State(cache): State<Cache>, Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let user_count = user::count(&db.conn, false).await?;

    if user_count == 1 {
        return Err(ResponseError::Forbidden(
            "you are the only user, can't delete yourself".to_owned(),
            format!(
                "user {}:{} ({}) want to delete itself but no user left.",
                user.id, user.account, user.nickname
            ),
        ));
    }
    let user = user::Model {
        account: format!("[DELETED]{}", user.id),
        nickname: format!("[DELETED]{}", user.id),
        email: Some(format!(
            "{}.deleted",
            user.email
                .unwrap_or(format!("deleted-{}@ret2shell", user.id))
        )),
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
    user::update(&db.conn, user).await?;
    Ok(StatusCode::OK)
}

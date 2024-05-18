use std::sync::{atomic::AtomicBool, Arc};

use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::IntoResponse,
    Extension,
};
use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use r2s_cache::Cache;
use r2s_config::auth;
use r2s_database::{
    config, game,
    user::{Permission, Permissions},
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::{debug, error};

use crate::traits::ResponseError;

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
            debug!("decode token failed: {err:?}, token is {token:?}");
            return Token::default();
        }
    };
    token_data.claims
}

async fn distribute_token(token: &Token, key: &str, expires_time: i64) -> String {
    let new_token = Token {
        exp: Utc::now().timestamp() + expires_time,
        ..token.clone()
    };
    let token = encode(
        &Header::default(),
        &new_token,
        &EncodingKey::from_secret(key.as_ref()),
    )
    .expect("Failed to encode token");
    token
}

pub async fn extract_user_info(
    State(ref mut cache): State<Cache>, Extension(config): Extension<config::Model>,
    mut req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
    let auth_config = config.auth.ok_or(ResponseError::InternalServerError(
        "auth config missing".into(),
        "auth section is not configured.".into(),
    ))?;
    let auth::Config {
        ref signing_key,
        buffer_time,
        expires_time,
        ..
    } = auth_config;
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let token_str = if let Some(auth_header) = auth_header {
        auth_header
            .strip_prefix("Bearer ")
            .unwrap_or(auth_header)
            .trim()
    } else {
        ""
    };

    let valid = cache.at("token").exists(token_str).await?;

    let token = if valid {
        decode_token(token_str, signing_key).await
    } else {
        Token::default()
    };
    debug!("user requested with token {token:?}");

    let last_time = token.exp - Utc::now().timestamp();

    let token_tracker = TokenTracker {
        token: Arc::new(Mutex::new(token.clone())),
        renew_requested: Arc::new(AtomicBool::new(last_time > 0 && last_time < buffer_time)),
        original: Some(token_str.to_owned()),
    };

    req.extensions_mut().insert(token_tracker.clone());
    req.extensions_mut().insert(token.clone());

    let mut resp = next.run(req).await;

    if token_tracker
        .renew_requested
        .load(std::sync::atomic::Ordering::Relaxed)
    {
        let original_token_str = token_tracker.original.as_ref().unwrap();
        cache.at("token").del(original_token_str).await?;
        let token_stored = token_tracker.token.lock().await.clone();
        cache
            .at("token")
            .rem(format!("user-{}", token_stored.id), original_token_str)
            .await?;
        let token_str = distribute_token(&token_stored, signing_key, expires_time).await;
        cache
            .at("token")
            .set_ex(&token_str, token_stored.id, 3 * 24 * 60 * 60)
            .await
            .map_err(|err| {
                error!("failed to store new token: {:?}", err);
            })
            .ok();
        resp.headers_mut().insert(
            "Set-Token",
            token_str.parse().expect("failed to parse token"),
        );
    }

    Ok(resp)
}

macro_rules! captcha_protected {
    ($cache:expr, $id:expr, $answer:expr) => {
        let captcha_id = $id;
        let captcha_answer = $answer;
        let captcha = $cache
            .at("captcha")
            .get::<r2s_captcha::Captcha>(captcha_id)
            .await?;
        if captcha.is_none() {
            return Err(ResponseError::Gone("captcha is outdate".to_owned()));
        }
        let captcha = captcha.unwrap();
        if !r2s_captcha::check(&captcha.validator, &captcha, captcha_answer).await? {
            return Err(ResponseError::Forbidden(
                "hey robot".to_owned(),
                "".to_owned(),
            ));
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
/// ```
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
            tracing::debug!("user permissions: {:?}", token.permissions.0);
            tracing::debug!("required perms: {:?}", required_perms);
            match required_perms.iter().all(|perm| token.permissions.0.contains(perm)) {
                true => Ok(next.run(req).await),
                false => Err(crate::traits::ResponseError::Forbidden("permission denied".to_owned(), "".to_owned()))
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
/// ```
/// Router::new()
///     .route(...)
///     .route_layer(axum::middleware::from_fn(permission_required_any!(Permission::Basic, ...)))
/// ```
macro_rules! permission_required_any {
    ($($perm:expr),*) => {
        |
            axum::extract::Extension(token): axum::extract::Extension<crate::controller::layer::auth::Token>,
            req: axum::extract::Request,
            next: axum::middleware::Next,
        | async move {
            if token.id <= 0 {
                return Err(crate::traits::ResponseError::Unauthorized("please login first".to_owned()));
            }
            let required_perms = [$($perm),*];
            tracing::debug!("user permissions: {:?}", token.permissions.0);
            tracing::debug!("required perms: {:?}", required_perms);
            match required_perms.iter().any(|perm| token.permissions.0.contains(perm)) {
                true => Ok(next.run(req).await),
                false => Err(crate::traits::ResponseError::Forbidden("permission denied".to_owned(), "".to_owned()))
            }
        }
    };
}

#[allow(unused_imports)]
pub(crate) use permission_required_all;
#[allow(unused_imports)]
pub(crate) use permission_required_any;

pub async fn game_admin_required(
    Extension(token): Extension<Token>, Extension(game): Extension<game::Model>, req: Request,
    next: Next,
) -> Result<impl IntoResponse, ResponseError> {
    if token.permissions.0.contains(&Permission::Game) && game.admins.0.contains(&token.id) {
        Ok(next.run(req).await)
    } else {
        Err(ResponseError::Forbidden(
            "permission denied".to_owned(),
            format!(
                "user {}:{} ({}) want to access game {}:{} admin api with out permission",
                token.id, token.account, token.nickname, game.id, game.name
            ),
        ))
    }
}

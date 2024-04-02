use axum::{response::IntoResponse, routing::get, Extension, Json, Router};
use r2s_database::config;
use rustc_version::version;

use crate::traits::{GlobalState, ResponseError};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/info", get(get_platform_info))
        .route("/auth", get(get_auth_config))
        .route("/version", get(get_version))
}

async fn get_platform_info(
    Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let server_config = config.server.clone().unwrap_or_default();
    Ok(Json(server_config.desensitize()))
}

async fn get_auth_config(
    Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let auth_config = config.auth.ok_or(ResponseError::InternalServerError(
        "missing auth config".to_owned(),
        "".to_owned(),
    ))?;
    Ok(Json(auth_config.desensitize()))
}

async fn get_version() -> Result<impl IntoResponse, ResponseError> {
    Ok(Json(format!(
        "{}-{}-{}",
        env!("CARGO_PKG_VERSION"),
        git_version::git_version!(
            args = ["--abbrev=8", "--always", "--dirty=*"],
            fallback = "unknown"
        )
        .to_uppercase(),
        version().unwrap()
    )))
}

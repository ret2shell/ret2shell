use axum::{
    extract::State, middleware, response::IntoResponse, routing::get, Extension, Json, Router,
};
use r2s_database::{config, user::Permission};

use crate::{
    middleware::auth,
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/config", get(get_config))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
            Permission::DevOps
        )))
        .route("/info", get(get_platform_info))
        .route("/auth", get(get_auth_config))
        .route("/version", get(get_version))
}

async fn get_config(
    Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    Ok(Json(config))
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

async fn get_version(
    State(ref version): State<String>,
) -> Result<impl IntoResponse, ResponseError> {
    Ok(Json(version.clone()))
}

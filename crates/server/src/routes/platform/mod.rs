use axum::{
    extract::State, middleware, response::IntoResponse, routing::get, Extension, Json, Router,
};
use futures::future::join_all;
use r2s_database::{
    config, institute,
    user::{self, Permission},
};
use r2s_migrator::Database;
use sea_orm::DbErr;
use serde::Serialize;

use crate::{
    middleware::auth,
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .nest(
            "/config",
            Router::new()
                .route("/", get(get_config))
                .route_layer(middleware::from_fn(auth::permission_required_all!(
                    Permission::DevOps
                ))),
        )
        .nest(
            "/statistics",
            Router::new()
                .route("/", get(get_platform_statistics))
                .route_layer(middleware::from_fn(auth::permission_required_all!(
                    Permission::Statistics
                ))),
        )
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

#[derive(Serialize)]
struct UserStatistics {
    pub total: u64,
    pub valid: u64,
    pub institutes: Vec<(i64, u64)>,
}

#[derive(Serialize)]
struct GameStatistics {}

#[derive(Serialize)]
struct Statistics {
    pub users: UserStatistics,
    pub institutes: Vec<institute::Model>,
    pub games: GameStatistics,
}

async fn get_platform_statistics(
    State(ref db): State<Database>,
) -> Result<impl IntoResponse, ResponseError> {
    let institutes = institute::get_list(&db.conn).await?;
    let users = UserStatistics {
        total: user::count(&db.conn, true, None).await?,
        valid: user::count(&db.conn, false, None).await?,
        institutes: join_all(
            institutes
                .iter()
                .map(|i| async { Ok((i.id, user::count(&db.conn, true, Some(i.id)).await?)) }),
        )
        .await
        .into_iter()
        .map(|r: Result<(i64, u64), DbErr>| r.unwrap_or((0, 0)))
        .collect(),
    };
    let games = GameStatistics {};
    let statistics = Statistics {
        users,
        institutes,
        games,
    };
    Ok(Json(statistics))
}

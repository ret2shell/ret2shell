use axum::{
    extract::{Path, Query, State},
    middleware,
    response::IntoResponse,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use chrono::{serde::ts_seconds, DateTime, Utc};
use r2s_database::{calendar, user::Permission};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};

use crate::{
    middleware::auth::{self, Token},
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route(
            "/:calendar_id",
            patch(update_calendar).delete(delete_calendar),
        )
        .route("/", post(create_calendar))
        .layer(middleware::from_fn(auth::permission_required_all!(
            Permission::Calendar
        )))
        .route("/:calendar_id", get(get_calendar))
        .route("/", get(get_calendar_list))
}

#[derive(Serialize, Deserialize)]
struct CalendarListQuery {
    #[serde(with = "ts_seconds")]
    start_time: DateTime<Utc>,
    #[serde(with = "ts_seconds")]
    end_time: DateTime<Utc>,
}

async fn get_calendar_list(
    State(ref db): State<Database>, Query(query): Query<CalendarListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    let results = calendar::get_list(&db.conn, query.start_time, query.end_time).await?;
    Ok(Json(results))
}

async fn get_calendar(
    State(ref db): State<Database>, Path(calendar_id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
    match calendar::get_ex(&db.conn, calendar_id).await? {
        Some(result) => Ok(Json(result)),
        None => Err(ResponseError::NotFound("event not found".to_owned())),
    }
}

async fn create_calendar(
    State(ref db): State<Database>, Extension(token): Extension<Token>,
    Json(calendar): Json<calendar::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = calendar::create(
        &db.conn,
        calendar::Model {
            reporter_id: Some(token.id),
            ..calendar
        },
    )
    .await?;
    Ok(Json(result))
}

async fn update_calendar(
    State(ref db): State<Database>, Extension(token): Extension<Token>,
    Path(calendar_id): Path<i64>, Json(calendar): Json<calendar::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = calendar::update(
        &db.conn,
        calendar_id,
        calendar::Model {
            reporter_id: Some(token.id),
            ..calendar
        },
    )
    .await?;
    Ok(Json(result))
}

async fn delete_calendar(
    State(ref db): State<Database>, Path(calendar_id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
    calendar::delete(&db.conn, calendar_id).await?;
    Ok(())
}

use axum::{
    extract::{Path, Query, State},
    middleware,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{serde::ts_seconds, DateTime, Utc};
use r2s_database::{calendar, user::Permission};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};

use crate::{
    middleware::auth,
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
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

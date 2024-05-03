use axum::{extract::State, response::IntoResponse, routing::get, Json, Router};
use r2s_database::institute;
use r2s_migrator::Database;

use crate::traits::{GlobalState, ResponseError};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new().route("/", get(get_institute_list))
}

async fn get_institute_list(
    State(ref db): State<Database>,
) -> Result<impl IntoResponse, ResponseError> {
    let institutes = institute::get_list(&db.conn).await?;
    Ok(Json(institutes))
}

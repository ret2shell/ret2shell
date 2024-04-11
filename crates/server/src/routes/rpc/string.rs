use axum::{extract::Query, response::IntoResponse, routing::get, Router};
use serde::Deserialize;

use crate::{
    traits::{GlobalState, ResponseError},
    utility::string::{deunicode_str, leet_str},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/deunicode", get(generate_deunicode))
        .route("/leet", get(generate_leet))
}

#[derive(Deserialize)]
struct GenericQuery {
    text: String,
}

async fn generate_deunicode(
    Query(query): Query<GenericQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    Ok(deunicode_str(query.text))
}

async fn generate_leet(
    Query(query): Query<GenericQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    Ok(leet_str(query.text))
}

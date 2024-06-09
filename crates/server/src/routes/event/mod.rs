use axum::{response::IntoResponse, routing::get, Router};
// use serde::Deserialize;

use crate::traits::{GlobalState, ResponseError};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new().route("/connect", get(connect_game))
}

// #[derive(Deserialize)]
// struct ConnectQuery {
//     pub game_id: i64,
//     pub token: String,
// }

async fn connect_game() -> Result<impl IntoResponse, ResponseError> {
    Ok(())
}

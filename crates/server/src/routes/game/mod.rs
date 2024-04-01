use axum::Router;

use crate::traits::GlobalState;

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
}

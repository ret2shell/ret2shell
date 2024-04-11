use axum::Router;

use crate::traits::GlobalState;

mod string;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new().nest("/string", string::router(state))
}

use axum::{middleware, Router};

use crate::{middleware::data, traits::GlobalState};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new().nest(
        "/:challenge_id",
        Router::new().layer(middleware::from_fn_with_state(
            state.clone(),
            data::prepare_data!(challenge),
        )),
    )
}

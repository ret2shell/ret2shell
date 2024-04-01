use axum::{middleware, Router};

use crate::{middleware::data, traits::GlobalState};

mod challenge;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new().nest(
        "/:game_id",
        Router::new()
            .nest("/challenge", challenge::router(state))
            .layer(middleware::from_fn_with_state(
                state.clone(),
                data::prepare_data!(game),
            )),
    )
}

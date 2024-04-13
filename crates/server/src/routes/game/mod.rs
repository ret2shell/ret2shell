use axum::{
    extract::{Query, State},
    middleware,
    response::IntoResponse,
    routing::get,
    Extension, Json, Router,
};
use r2s_database::{game, user::Permission};
use r2s_migrator::Database;
use serde::Deserialize;

use crate::{
    middleware::{auth::Token, data},
    traits::{GlobalState, ResponseError},
};

mod challenge;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .nest(
            "/:game_id",
            Router::new()
                .nest("/challenge", challenge::router(state))
                .route("/", get(get_game))
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    data::prepare_data!(game),
                )),
        )
        .route("/", get(get_game_list))
}

#[derive(Deserialize)]
struct GameListQuery {
    page: Option<u64>,
    page_size: Option<u64>,
    host_type: Option<game::HostType>,
    weight: Option<i32>,
}

async fn get_game_list(
    State(ref db): State<Database>, Extension(token): Extension<Token>,
    Query(query): Query<GameListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    let results = game::get_page(
        &db.conn,
        query.page.unwrap_or(1),
        query.page_size.unwrap_or(15),
        query.host_type,
        query.weight,
        token.permissions.0.contains(&Permission::Host)
            || token.permissions.0.contains(&Permission::Game),
    )
    .await?;
    Ok(Json(results))
}

async fn get_game(
    Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    if game.hidden
        && !token.permissions.0.contains(&Permission::Host)
        && !(token.permissions.0.contains(&Permission::Game) && game.admins.contains(&token.id))
    {
        return Err(ResponseError::NotFound("game not found".to_owned()));
    }
    Ok(Json(game))
}

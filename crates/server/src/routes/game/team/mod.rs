use axum::{
    extract::{Query, State},
    middleware,
    response::IntoResponse,
    routing::get,
    Extension, Json, Router,
};
use r2s_database::{game, team, user::Permission};
use r2s_migrator::Database;
use serde::Deserialize;

use crate::{
    middleware::{auth::Token, data},
    traits::{GlobalState, ResponseError},
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new().route("/", get(get_team_list)).nest(
        "/:team",
        Router::new()
            .route("/", get(get_team_info))
            .layer(middleware::from_fn_with_state(
                state.clone(),
                data::prepare_data!(team, false),
            )),
    )
}

#[derive(Deserialize)]
struct TeamInfoQuery {
    pub ex: Option<bool>,
}

async fn get_team_info(
    State(ref db): State<Database>, Extension(team): Extension<team::Model>,
    Query(query): Query<TeamInfoQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    if query.ex.unwrap_or(false) {
        Ok(Json(team.into()))
    } else {
        Ok(Json(
            team::get_ex(&db.conn, team.id)
                .await?
                .ok_or(ResponseError::NotFound("team".to_string()))?,
        ))
    }
}

#[derive(Deserialize)]
struct TeamListQuery {
    pub filter: Option<String>,
    pub institute_id: Option<i64>,
    pub order_by: Option<String>,
    pub asc: Option<bool>,
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub min_state: Option<team::State>,
}

async fn get_team_list(
    State(ref db): State<Database>, Extension(game): Extension<game::Model>,
    Extension(token): Extension<Token>, Query(query): Query<TeamListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    let min_state = if query
        .min_state
        .clone()
        .is_some_and(|s| s < team::State::Hidden)
        && !(token.permissions.0.contains(&Permission::Game) && game.admins.0.contains(&token.id))
    {
        Some(team::State::Hidden)
    } else {
        query.min_state
    };
    let results = team::get_page(
        &db.conn,
        game.id,
        query.page.unwrap_or(1),
        query.page_size.unwrap_or(15),
        min_state,
        query.institute_id,
        query.filter,
        query.order_by,
        query.asc.unwrap_or(true),
    )
    .await?;
    Ok(Json(results))
}

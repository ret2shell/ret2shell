use axum::{
    extract::{Query, State},
    middleware,
    response::IntoResponse,
    routing::get,
    Extension, Json, Router,
};
use r2s_database::team;
use r2s_migrator::Database;
use serde::Deserialize;

use crate::{
    middleware::data,
    traits::{GlobalState, ResponseError},
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new().nest(
        "/:team",
        Router::new()
            .route("/", get(get_team_info))
            .layer(middleware::from_fn_with_state(
                state.clone(),
                data::prepare_data!(team),
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

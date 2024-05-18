use axum::{
    extract::{Query, State},
    middleware,
    response::IntoResponse,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use r2s_bucket::Bucket;
use r2s_database::{game, user::Permission};
use r2s_migrator::Database;
use serde::Deserialize;
use tracing::warn;

use crate::{
    middleware::{
        auth::{self, Token},
        data,
    },
    traits::{GlobalState, ResponseError},
};

mod challenge;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/", post(create_game))
        .layer(middleware::from_fn(auth::permission_required_all!(
            Permission::Host
        )))
        .nest(
            "/:game",
            Router::new()
                .route("/", patch(update_game).delete(delete_game))
                .layer(middleware::from_fn(auth::game_admin_required))
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
        && !(token.permissions.0.contains(&Permission::Game) && game.admins.0.contains(&token.id))
    {
        warn!(
            "unauthorized user {} ({}:{}) trying to get a hidden game {}:{}",
            token.nickname, token.id, token.account, game.id, game.name
        );
        return Err(ResponseError::NotFound("game not found".to_owned()));
    }
    Ok(Json(game))
}

async fn create_game(
    State(ref db): State<Database>, State(ref bucket): State<Bucket>,
    Extension(token): Extension<Token>, Json(mut model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let game_bucket = bucket.create(serde_json::to_value(&model)?).await?;
    model.bucket = Some(game_bucket.name.clone());
    let model = game::create(
        &db.conn,
        game::Model {
            admins: game::Admins(vec![token.id]),
            introduction_id: None,
            ..model
        },
    )
    .await;

    match model {
        Ok(model) => Ok(Json(model)),
        Err(e) => {
            bucket.delete(&game_bucket.name).await.ok();
            Err(e)?
        }
    }
}

async fn update_game(
    State(ref db): State<Database>, Extension(game): Extension<game::Model>,
    Json(model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let model = game::update(
        &db.conn,
        game::Model {
            id: game.id,
            bucket: game.bucket.clone(),
            introduction_id: game.introduction_id,
            ..model
        },
    )
    .await?;
    Ok(Json(model))
}

#[derive(Deserialize)]
pub struct DeleteGameQuery {
    force: Option<bool>,
}

async fn delete_game(
    State(ref db): State<Database>, State(ref bucket): State<Bucket>,
    Extension(game): Extension<game::Model>, Query(query): Query<DeleteGameQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    let delete_result = bucket.delete(&game.bucket.clone().unwrap()).await;
    if !query.force.unwrap_or(false) {
        delete_result?;
    }
    game::delete(&db.conn, game.id).await?;
    Ok(())
}

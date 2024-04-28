use axum::{
    extract::{Query, State},
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use r2s_bucket::Bucket;
use r2s_database::{calendar, game, user::Permission};
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
        Ok(model) => {
            calendar::create(
                &db.conn,
                calendar::Model {
                    id: 0,
                    name: model.name.clone(),
                    link: format!("/games/{}", model.id),
                    start_at: model.start_at.clone(),
                    end_at: model.end_at.clone(),
                    intro: Some(model.brief.clone()), // should be replaced with introduction article later.
                    reporter_id: Some(token.id),
                },
            )
            .await
            .ok();
            Ok(Json(model))
        }
        Err(e) => {
            bucket.delete(&game_bucket.name).await.ok();
            Err(e)?
        }
    }
}

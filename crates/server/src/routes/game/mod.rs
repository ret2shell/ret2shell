use axum::{
    extract::{Query, State},
    middleware,
    response::IntoResponse,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use nanoid::nanoid;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_database::{article, game, user::Permission};
use r2s_migrator::Database;
use sea_orm::TransactionTrait;
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
mod chat;
mod notification;
mod team;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/", post(create_game))
        .layer(middleware::from_fn(auth::permission_required_all!(
            Permission::Host
        )))
        .nest(
            "/:game",
            Router::new()
                .route("/introduction", patch(update_game_intro))
                .route("/", patch(update_game).delete(delete_game))
                .layer(middleware::from_fn(auth::game_admin_required))
                .nest("/challenge", challenge::router(state))
                .nest("/team", team::router(state))
                .nest("/notification", notification::router(state))
                .nest("/chat", chat::router(state))
                .route("/introduction", get(get_game_intro))
                .route("/", get(get_game))
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    data::prepare_data!(game, true),
                )),
        )
        .route("/", get(get_game_list))
}

macro_rules! get_game_bucket_mut {
    ($bucket:expr, $game: expr) => {{
        $bucket
            .at_mut(
                &$game
                    .bucket
                    .clone()
                    .ok_or(ResponseError::InternalServerError(
                        "bucket is not exist for this game".into(),
                        format!(
                            "game {}:'{}' does not have a valid bucket",
                            $game.id, $game.name
                        ),
                    ))?,
            )
            .await?
    }};
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
    Ok(Json((
        results
            .0
            .iter()
            .filter(|g| !g.hidden || g.admins.0.contains(&token.id))
            .cloned()
            .collect::<Vec<_>>(),
        results.1,
    )))
}

async fn get_game(
    Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    if game.hidden
        && !(token.permissions.0.contains(&Permission::Game) && game.admins.0.contains(&token.id))
    {
        warn!(
            "unauthorized user {}:'{}' ({}) trying to get a hidden game {}:'{}'",
            token.id, token.account, token.nickname, game.id, game.name
        );
        return Err(ResponseError::NotFound("game not found".to_owned()));
    }
    if token.permissions.0.contains(&Permission::Game) && game.admins.0.contains(&token.id) {
        Ok(Json(game))
    } else {
        Ok(Json(game.desensitize()))
    }
}

async fn create_game(
    State(ref db): State<Database>, State(ref bucket): State<Bucket>,
    Extension(token): Extension<Token>, Json(mut model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let txn = db.conn.begin().await?;
    let game_bucket = bucket.create(serde_json::to_value(&model)?).await?;
    model.bucket = Some(game_bucket.name.clone());
    let model = game::create(
        &txn,
        game::Model {
            admins: game::Admins(vec![token.id]),
            introduction_id: None,
            token: Some(nanoid!()),
            ..model
        },
    )
    .await;

    match model {
        Ok(model) => {
            txn.commit().await?;
            Ok(Json(model))
        }
        Err(e) => {
            bucket.delete(&game_bucket.name).await.ok();
            Err(e)?
        }
    }
}

async fn update_game(
    State(ref db): State<Database>, State(ref cache): State<Cache>,
    State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
    Json(model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let txn = db.conn.begin().await?;
    let model = game::update(
        &txn,
        game::Model {
            id: game.id,
            bucket: game.bucket.clone(),
            introduction_id: game.introduction_id,
            ..model
        },
    )
    .await?;
    cache.at("game").del(game.id).await?;
    let game_bucket = get_game_bucket_mut!(bucket, game);
    game_bucket
        .set_config(serde_json::to_value(&model)?)
        .await?;
    game_bucket
        .take_shot(
            ":construction: update game config",
            "platform",
            "platform@woooo.tech",
        )
        .await?;
    txn.commit().await?;
    Ok(Json(model))
}

#[derive(Deserialize)]
pub struct DeleteGameQuery {
    force: Option<bool>,
}

async fn delete_game(
    State(ref db): State<Database>, State(ref cache): State<Cache>,
    State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
    Query(query): Query<DeleteGameQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    let delete_result = bucket.delete(&game.bucket.clone().unwrap()).await;
    if !query.force.unwrap_or(false) {
        delete_result?;
    }
    cache.at("game").del(game.id).await?;
    game::delete(&db.conn, game.id).await?;
    Ok(())
}

async fn get_game_intro(
    State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    if let Some(intro_id) = game.introduction_id {
        let intro = article::get_ex(&db.conn, intro_id).await?;
        Ok(Json(intro))
    } else {
        Err(ResponseError::NotFound("introduction not found".to_owned()))
    }
}

async fn update_game_intro(
    State(ref db): State<Database>, State(ref cache): State<Cache>,
    State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
    Extension(token): Extension<Token>, Json(model): Json<article::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let txn = db.conn.begin().await?;
    let result = if let Some(intro_id) = game.introduction_id {
        article::update(
            &txn,
            intro_id,
            article::Model {
                id: intro_id,
                publisher_id: token.id,
                ..model
            },
        )
        .await?
    } else {
        let model = article::create(
            &txn,
            article::Model {
                id: 0,
                publisher_id: token.id,
                ..model
            },
        )
        .await?;
        game::update(
            &txn,
            game::Model {
                id: game.id,
                introduction_id: Some(model.id),
                ..game.clone()
            },
        )
        .await?;
        cache.at("game").del(game.id).await?;
        model
    };

    let game_bucket = get_game_bucket_mut!(bucket, game);
    game_bucket
        .set_introduction(&result.clone().content.unwrap_or("NO CONTENT".into()))
        .await?;
    game_bucket
        .take_shot(":memo: update README.md", "platform", "platform@woooo.tech")
        .await?;
    txn.commit().await?;

    Ok(Json(result))
}

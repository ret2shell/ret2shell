use axum::{
    extract::{Path, State},
    middleware,
    response::IntoResponse,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use r2s_cache::Cache;
use r2s_database::{article, user::Permission};
use r2s_migrator::Database;

use crate::{
    middleware::auth::{self, Token},
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/:article_id", patch(update_wiki).delete(delete_wiki))
        .route("/", post(create_wiki))
        .layer(middleware::from_fn(auth::permission_required_all!(
            Permission::Wiki
        )))
        .route("/:article_id", get(get_wiki))
        .route("/", get(get_wiki_tree))
}

async fn get_wiki_tree(
    State(ref db): State<Database>, State(ref cache): State<Cache>,
    Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = cache.at("wiki").get("toc").await?;
    if let Some(result) = result {
        Ok(Json(result))
    } else {
        let is_admin = token.permissions.0.contains(&Permission::Wiki);
        let result =
            article::get_tree(&db.conn, article::AccessPolicy::Wiki, is_admin, is_admin).await?;
        cache.at("wiki").set("toc", &result).await?;
        Ok(Json(result))
    }
}

async fn get_wiki(
    State(ref db): State<Database>, Path(article_id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = article::get_ex(&db.conn, article_id)
        .await?
        .ok_or(ResponseError::NotFound("wiki not found".to_owned()))?;
    Ok(Json(result))
}

async fn create_wiki(
    State(ref db): State<Database>, State(ref cache): State<Cache>,
    Extension(token): Extension<Token>, Json(article): Json<article::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = article::create(
        &db.conn,
        article::Model {
            access_policy: article::AccessPolicy::Wiki,
            publisher_id: token.id,
            ..article
        },
    )
    .await?;
    cache.at("wiki").del("toc").await?; // remove cache

    Ok(Json(result))
}

async fn update_wiki(
    State(ref db): State<Database>, State(ref cache): State<Cache>, Path(article_id): Path<i64>,
    Extension(token): Extension<Token>, Json(article): Json<article::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = article::update(
        &db.conn,
        article_id,
        article::Model {
            access_policy: article::AccessPolicy::Wiki,
            publisher_id: token.id,
            ..article
        },
    )
    .await?;
    cache.at("wiki").del("toc").await?; // remove cache
    Ok(Json(result))
}

async fn delete_wiki(
    State(ref db): State<Database>, Path(article_id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
    article::delete(&db.conn, article_id).await?;
    Ok(())
}

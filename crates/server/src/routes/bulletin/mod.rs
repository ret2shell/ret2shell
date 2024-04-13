use axum::{
    extract::{Path, Query, State},
    middleware,
    response::IntoResponse,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use r2s_database::{article, user::Permission};
use r2s_migrator::Database;
use serde::Deserialize;

use crate::{
    middleware::auth::{self, Token},
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route(
            "/:article_id",
            patch(update_bulletin).delete(delete_bulletin),
        )
        .route("/", post(create_bulletin))
        .layer(middleware::from_fn(auth::permission_required_all!(
            Permission::Bulletin
        )))
        .route("/:article_id", get(get_bulletin))
        .route("/", get(get_bulletin_list))
}

#[derive(Deserialize)]
struct BulletinListQuery {
    page: Option<u64>,
    page_size: Option<u64>,
}

async fn get_bulletin_list(
    State(ref db): State<Database>, Query(query): Query<BulletinListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    let results = article::get_page(
        &db.conn,
        query.page.unwrap_or(1),
        query.page_size.unwrap_or(15),
        article::AccessPolicy::Bulletin,
        false,
        false,
    )
    .await?;
    Ok(Json(results))
}

async fn get_bulletin(
    State(ref db): State<Database>, Path(article_id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
    match article::get_ex(&db.conn, article_id).await? {
        Some(result) => {
            if result.access_policy.eq(&article::AccessPolicy::Bulletin) {
                return Ok(Json(result));
            }
            Err(ResponseError::NotFound("bulletin not found".to_owned()))
        }
        None => Err(ResponseError::NotFound("bulletin not found".to_owned())),
    }
}

async fn create_bulletin(
    State(ref db): State<Database>, Extension(token): Extension<Token>,
    Json(article): Json<article::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = article::create(
        &db.conn,
        article::Model {
            access_policy: article::AccessPolicy::Bulletin,
            publisher_id: token.id,
            ..article
        },
    )
    .await?;
    Ok(Json(result))
}

async fn update_bulletin(
    State(ref db): State<Database>, Extension(token): Extension<Token>,
    Path(article_id): Path<i64>, Json(article): Json<article::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let result = article::update(
        &db.conn,
        article_id,
        article::Model {
            access_policy: article::AccessPolicy::Bulletin,
            publisher_id: token.id,
            ..article
        },
    )
    .await?;
    Ok(Json(result))
}

async fn delete_bulletin(
    State(ref db): State<Database>, Path(article_id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
    article::delete(&db.conn, article_id).await?;
    Ok(())
}

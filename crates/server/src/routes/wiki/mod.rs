use axum::{
  Extension, Json, Router,
  extract::{Path, State},
  middleware,
  response::IntoResponse,
  routing::{get, patch, post},
};
use r2s_cache::Cache;
use r2s_database::{article, user::Permission};
use r2s_migrator::Database;
use tracing::info;

use crate::{
  middleware::auth::{self, Token},
  traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .route("/{article}", patch(update_wiki).delete(delete_wiki))
    .route("/", post(create_wiki))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Wiki
    )))
    .route("/{article}", get(get_wiki))
    .route("/", get(get_wiki_tree))
}

/// Cache key of the table of contents shown to regular visitors.
const TOC_KEY: &str = "toc";
/// Cache key of the table of contents shown to wiki administrators, which also
/// contains drafts and unpublished articles.
const TOC_ADMIN_KEY: &str = "toc:admin";

/// The cached table of contents depends on the caller's permissions, so the
/// anonymous and the administrative views must never share a cache slot.
fn toc_cache_key(is_admin: bool) -> &'static str {
  if is_admin { TOC_ADMIN_KEY } else { TOC_KEY }
}

/// Drop both cached views of the table of contents.
async fn invalidate_toc(cache: &Cache) -> Result<(), r2s_cache::CacheError> {
  let wiki = cache.at("wiki");
  wiki.del(TOC_KEY).await?;
  wiki.del(TOC_ADMIN_KEY).await?;
  Ok(())
}

async fn get_wiki_tree(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  let is_admin = token.permissions.0.contains(&Permission::Wiki);
  let wiki = cache.at("wiki");
  let key = toc_cache_key(is_admin);
  let result = wiki.get(key).await?;
  if let Some(result) = result {
    Ok(Json(result))
  } else {
    let result =
      article::get_tree(&db.conn, article::AccessPolicy::Wiki, is_admin, is_admin).await?;
    wiki.set(key, &result).await?;
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
  invalidate_toc(cache).await?;
  info!(title=%result.title, "wiki article created");

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
  invalidate_toc(cache).await?;
  Ok(Json(result))
}

async fn delete_wiki(
  State(ref db): State<Database>, State(ref cache): State<Cache>, Path(article_id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  article::delete(&db.conn, article_id).await?;
  invalidate_toc(cache).await?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::{TOC_ADMIN_KEY, TOC_KEY, toc_cache_key};

  #[test]
  fn admin_and_public_toc_use_separate_cache_keys() {
    assert_eq!(toc_cache_key(false), TOC_KEY);
    assert_eq!(toc_cache_key(true), TOC_ADMIN_KEY);
    assert_ne!(toc_cache_key(false), toc_cache_key(true));
  }
}

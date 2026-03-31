use std::collections::HashMap;

use axum::{
  Extension, Json,
  extract::{Multipart, Path, State},
  response::IntoResponse,
};
use futures::TryStreamExt;
use r2s_cache::Cache;
use r2s_cluster::Cluster;
use r2s_config::GlobalConfig;
use r2s_database::game;
use r2s_migrator::Database;
use tokio_util::io::StreamReader;
use tracing::info;

use crate::traits::ResponseError;

pub(super) async fn get_cluster_registry_repo(
  State(config): State<GlobalConfig>, State(cluster): State<Cluster>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if config
    .cluster
    .is_none_or(|c| c.registry.is_none_or(|r| r.enabled.is_none_or(|i| !i)))
  {
    return Ok(Json(vec![]));
  }
  let repos: Option<Vec<String>> = cache
    .at("registry")
    .get(&game.bucket.clone().unwrap_or("_".to_string()))
    .await?;
  if let Some(repos) = repos {
    return Ok(Json(repos));
  }
  let mut registry = if let Some(registry) = cluster.registry {
    registry
  } else {
    return Err(ResponseError::NotFound("registry".to_string()));
  };

  let repos = registry.sync_repo().await?;
  for i in &repos {
    let (org, repo) = i;
    cache.at("registry").set(org, repo).await?;
  }
  Ok(Json(
    repos
      .get(&game.bucket.unwrap_or("_".to_string()))
      .unwrap_or(&vec![])
      .clone(),
  ))
}

pub(super) async fn get_cluster_registry_image(
  State(cluster): State<Cluster>, Path(params): Path<HashMap<String, String>>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let registry = if let Some(registry) = cluster.registry {
    registry
  } else {
    return Err(ResponseError::NotFound("registry".to_string()));
  };
  let image = params
    .get("image")
    .ok_or(ResponseError::BadRequest("no image".to_string()))?;
  let tags = registry
    .images(&format!(
      "{}/{image}",
      game.bucket.unwrap_or("_".to_string())
    ))
    .await?;
  Ok(Json(tags))
}

pub(super) async fn upload_image(
  State(cluster): State<Cluster>, State(cache): State<Cache>, State(ref db): State<Database>,
  Extension(game): Extension<game::Model>, mut multipart: Multipart,
) -> Result<impl IntoResponse, ResponseError> {
  super::ensure_game_sync_writable(&db.conn, &game).await?;
  let registry = if let Some(registry) = cluster.registry {
    registry
  } else {
    return Err(ResponseError::NotFound("registry".to_string()));
  };
  if let Some(field) = multipart
    .next_field()
    .await
    .map_err(|err| ResponseError::BadRequest(err.to_string()))?
  {
    let file_name = field
      .file_name()
      .ok_or(ResponseError::BadRequest(
        "file name is required".to_owned(),
      ))?
      .to_owned();
    let reader = StreamReader::new(field.map_err(std::io::Error::other));
    registry
      .upload_image(
        game.bucket.as_ref().unwrap_or(&"_".to_string()),
        &file_name,
        reader,
      )
      .await?;
    cache
      .at("registry")
      .del(game.bucket.as_ref().unwrap_or(&"_".to_string()))
      .await?;
    info!(
      repo=%game.bucket.unwrap_or("_".to_string()),
      image=%file_name,
      "uploaded image to registry via file upload");
    Ok(())
  } else {
    Err(ResponseError::BadRequest("no file".to_string()))
  }
}

pub(super) async fn get_cluster_registry_config(
  State(config): State<GlobalConfig>,
) -> Result<impl IntoResponse, ResponseError> {
  if let Some(cluster) = config.cluster {
    Ok(Json(cluster.registry))
  } else {
    Ok(Json(None))
  }
}

pub(super) async fn refresh_cluster_registry(
  State(cache): State<Cache>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  cache.at("registry").del("_").await?;
  cache
    .at("registry")
    .del(game.bucket.as_ref().unwrap_or(&"_".to_string()))
    .await?;
  Ok(())
}

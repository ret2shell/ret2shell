use axum::{
  Extension, Json,
  extract::{Path, Query, State},
  response::IntoResponse,
};
use chrono::Utc;
use r2s_database::{game_registry_source, game_sync_job};
use serde::{Deserialize, Serialize};

use crate::{
  middleware::auth::Token,
  routes::sync::direct::{self, DirectImportRequest, SyncJobResponse},
  sync::registry,
  traits::{GlobalState, ResponseError},
};

#[derive(Deserialize)]
pub(super) struct SourceQuery {
  pub source_id: i64,
}

#[derive(Serialize)]
pub(super) struct CatalogGameResponse {
  pub game_key: String,
  pub release_count: usize,
}

#[derive(Serialize)]
pub(super) struct CatalogReleaseResponse {
  pub game_key: String,
  pub release_id: String,
  pub snapshot_commit: String,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub published_at: chrono::DateTime<Utc>,
}

#[derive(Serialize)]
pub(super) struct CatalogUpstreamResponse {
  pub instance_id: String,
  pub role: String,
  pub base_url: String,
  pub auth_mode: String,
  pub protocol_version: i32,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub published_at: chrono::DateTime<Utc>,
}

#[derive(Serialize)]
pub(super) struct CatalogReleaseDetailResponse {
  pub game_key: String,
  pub release_id: String,
  pub snapshot_commit: String,
  pub manifest_sha256: String,
  pub upstreams: Vec<CatalogUpstreamResponse>,
  pub conflicts: Vec<CatalogReleaseConflictResponse>,
}

#[derive(Serialize)]
pub(super) struct CatalogReleaseConflictResponse {
  pub source_id: i64,
  pub source_name: String,
  pub manifest_sha256: String,
  pub snapshot_commit: String,
}

#[derive(Deserialize)]
pub(super) struct CatalogImportRequest {
  pub source_id: i64,
  pub game_key: String,
  pub release_id: String,
  pub upstream_instance_id: String,
}

pub(super) async fn list_catalog_games(
  State(state): State<GlobalState>, Query(query): Query<SourceQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let source = load_source(&state, query.source_id).await?;
  let games = registry::list_catalog_games(&state.config.bucket, &source)
    .await
    .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;
  Ok(Json(
    games
      .into_iter()
      .map(|game| CatalogGameResponse {
        game_key: game.game_key,
        release_count: game.release_count,
      })
      .collect::<Vec<_>>(),
  ))
}

pub(super) async fn list_catalog_releases(
  State(state): State<GlobalState>, Path(game_key): Path<String>, Query(query): Query<SourceQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let source = load_source(&state, query.source_id).await?;
  let releases = registry::list_catalog_releases(&state.config.bucket, &source, &game_key)
    .await
    .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;
  Ok(Json(
    releases
      .into_iter()
      .map(|release| CatalogReleaseResponse {
        game_key: release.game_key,
        release_id: release.release_id,
        snapshot_commit: release.snapshot_commit,
        first_party_instance_id: release.first_party_instance_id,
        first_party_base_url: release.first_party_base_url,
        published_at: release.published_at,
      })
      .collect::<Vec<_>>(),
  ))
}

pub(super) async fn get_catalog_release_detail(
  State(state): State<GlobalState>, Path((game_key, release_id)): Path<(String, String)>,
  Query(query): Query<SourceQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let source = load_source(&state, query.source_id).await?;
  let all_sources = game_registry_source::get_list(&state.db.conn).await?;
  let detail =
    registry::get_catalog_release_detail(&state.config.bucket, &source, &game_key, &release_id)
      .await
      .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;
  let conflicts = registry::list_catalog_release_conflicts(
    &state.config.bucket,
    &all_sources,
    source.id,
    &game_key,
    &release_id,
    &detail.manifest_sha256,
    &detail.manifest.snapshot_commit,
  )
  .await
  .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;
  Ok(Json(CatalogReleaseDetailResponse {
    game_key: detail.manifest.game_key,
    release_id: detail.manifest.release_id,
    snapshot_commit: detail.manifest.snapshot_commit,
    manifest_sha256: detail.manifest_sha256,
    upstreams: detail
      .upstreams
      .into_iter()
      .map(|upstream| CatalogUpstreamResponse {
        instance_id: upstream.instance_id,
        role: upstream.role,
        base_url: upstream.base_url,
        auth_mode: upstream.auth_mode,
        protocol_version: upstream.protocol_version,
        published_at: upstream.published_at,
      })
      .collect(),
    conflicts: conflicts
      .into_iter()
      .map(|conflict| CatalogReleaseConflictResponse {
        source_id: conflict.source_id,
        source_name: conflict.source_name,
        manifest_sha256: conflict.manifest_sha256,
        snapshot_commit: conflict.snapshot_commit,
      })
      .collect(),
  }))
}

pub(super) async fn import_catalog_release(
  State(state): State<GlobalState>, Extension(token): Extension<Token>,
  Json(req): Json<CatalogImportRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let source = load_source(&state, req.source_id).await?;
  let detail = registry::get_catalog_release_detail(
    &state.config.bucket,
    &source,
    req.game_key.trim(),
    req.release_id.trim(),
  )
  .await
  .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;
  let upstream = detail
    .upstreams
    .into_iter()
    .find(|upstream| upstream.instance_id == req.upstream_instance_id)
    .ok_or(ResponseError::PreconditionFailed(
      "selected upstream is not available in the registry discovery source".to_owned(),
    ))?;
  let job = direct::create_import_job(
    &state,
    token.id,
    game_sync_job::SyncJobMode::Registry,
    Some(source.id),
    Some(upstream.instance_id.clone()),
    Some(upstream.base_url.clone()),
    DirectImportRequest {
      base_url: upstream.base_url,
      sync_token: Some(upstream.sync_token),
      game_key: req.game_key,
      release_id: req.release_id,
    },
  )
  .await?;
  direct::spawn_import_job(state.clone(), job.id);
  Ok(Json(SyncJobResponse::from(job)))
}

async fn load_source(
  state: &GlobalState, source_id: i64,
) -> Result<game_registry_source::Model, ResponseError> {
  game_registry_source::get(&state.db.conn, source_id)
    .await?
    .ok_or(ResponseError::NotFound(
      "registry discovery source not found".to_owned(),
    ))
}

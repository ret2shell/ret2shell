use std::{
  collections::{BTreeMap, BTreeSet},
  fs::OpenOptions as StdOpenOptions,
  io::ErrorKind,
  path::{Path, PathBuf},
};

use axum::{
  Extension, Json,
  body::{Body, to_bytes},
  extract::State,
  http::{
    HeaderValue, Method, Request, Uri,
    header::{AUTHORIZATION, RANGE},
  },
  response::IntoResponse,
};
use chrono::{DateTime, Utc};
use deunicode::deunicode_with_tofu;
use futures::TryStreamExt;
use heck::ToSnakeCase;
use r2s_bucket::{Bucket, git::Git};
use r2s_captcha::sha256sum_str;
use r2s_cluster::SyncImageMirrorRequest;
use r2s_database::{
  challenge, game, game_registry_source, game_release, game_remote_sync, game_sync_job, hint, media,
};
use r2s_media::Media;
use r2s_migrator::Database;
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::{
  fs::{File, OpenOptions, create_dir_all, read_dir, remove_dir_all, remove_file, rename},
  io::{AsyncSeekExt, AsyncWriteExt},
  process::Command,
};
use tokio_util::io::StreamReader;

use crate::{
  middleware::auth::Token,
  sync::{self, manifest, registry},
  traits::{GlobalState, HTTPClient, ResponseError},
};

#[derive(Deserialize)]
pub(super) struct DirectDiscoverRequest {
  pub base_url: String,
  pub sync_token: Option<String>,
  pub game_key: Option<String>,
  pub release_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct DirectImportRequest {
  pub base_url: String,
  pub sync_token: Option<String>,
  pub game_key: String,
  pub release_id: String,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum SyncJobStatusView {
  Pending,
  Running,
  Paused,
  Failed,
  Completed,
  Cancelled,
}

impl From<game_sync_job::SyncJobStatus> for SyncJobStatusView {
  fn from(value: game_sync_job::SyncJobStatus) -> Self {
    match value {
      game_sync_job::SyncJobStatus::Pending => Self::Pending,
      game_sync_job::SyncJobStatus::Running => Self::Running,
      game_sync_job::SyncJobStatus::Paused => Self::Paused,
      game_sync_job::SyncJobStatus::Failed => Self::Failed,
      game_sync_job::SyncJobStatus::Completed => Self::Completed,
      game_sync_job::SyncJobStatus::Cancelled => Self::Cancelled,
    }
  }
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum SyncJobModeView {
  Registry,
  Direct,
}

impl From<game_sync_job::SyncJobMode> for SyncJobModeView {
  fn from(value: game_sync_job::SyncJobMode) -> Self {
    match value {
      game_sync_job::SyncJobMode::Registry => Self::Registry,
      game_sync_job::SyncJobMode::Direct => Self::Direct,
    }
  }
}

#[derive(Serialize)]
pub(super) struct SyncJobResponse {
  pub id: i64,
  pub mode: SyncJobModeView,
  pub status: SyncJobStatusView,
  pub stage: String,
  pub game_id: Option<i64>,
  pub game_key: Option<String>,
  pub release_id: Option<String>,
  pub registry_source_id: Option<i64>,
  pub upstream_instance_id: Option<String>,
  pub upstream_base_url: Option<String>,
  pub error_message: Option<String>,
  pub can_resume: bool,
  pub can_cancel: bool,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub created_at: chrono::DateTime<Utc>,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub updated_at: chrono::DateTime<Utc>,
  #[serde(with = "chrono::serde::ts_seconds_option")]
  pub finished_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Serialize)]
pub(super) struct SyncJobRequestView {
  pub base_url: String,
  pub has_sync_token: bool,
  pub game_key: String,
  pub release_id: String,
}

#[derive(Serialize)]
pub(super) struct SyncJobDiscoveredView {
  pub remote_instance_id: String,
  pub remote_base_url: String,
  pub protocol_version: i32,
  pub snapshot_commit: String,
  pub manifest_sha256: String,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  pub published_at: i64,
  pub media_total: usize,
  pub oci_total: usize,
}

#[derive(Serialize)]
pub(super) struct SyncJobRepoCheckpointView {
  pub initialized: bool,
  pub fetched_release_ref: bool,
  pub checked_out_snapshot: bool,
  pub verified_snapshot: bool,
}

#[derive(Serialize)]
pub(super) struct SyncJobAssetCheckpointView {
  pub done: usize,
  pub total: usize,
  pub completed: bool,
}

#[derive(Serialize)]
pub(super) struct SyncJobCheckpointView {
  pub bucket_name: Option<String>,
  pub discovered: Option<SyncJobDiscoveredView>,
  pub repo: SyncJobRepoCheckpointView,
  pub media: SyncJobAssetCheckpointView,
  pub oci: SyncJobAssetCheckpointView,
}

#[derive(Serialize)]
pub(super) struct SyncJobDetailResponse {
  #[serde(flatten)]
  pub job: SyncJobResponse,
  pub request: SyncJobRequestView,
  pub checkpoint: SyncJobCheckpointView,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(default)]
struct DirectImportCheckpoint {
  discovered: Option<DirectImportDiscovered>,
  bucket_name: Option<String>,
  repo: RepoCheckpoint,
  media: MediaCheckpoint,
  oci: OciCheckpoint,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(default)]
struct RepoCheckpoint {
  initialized: bool,
  fetched_release_ref: bool,
  checked_out_snapshot: bool,
  verified_snapshot: bool,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(default)]
struct MediaCheckpoint {
  downloaded_hashes: BTreeSet<String>,
  completed: bool,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(default)]
struct OciCheckpoint {
  mirrored_images: BTreeSet<String>,
  completed: bool,
}

#[derive(Debug)]
struct ImportTargetLock {
  path: PathBuf,
}

impl ImportTargetLock {
  async fn acquire(
    config: &Option<r2s_config::bucket::Config>, bucket_name: &str,
  ) -> Result<Self, ResponseError> {
    let path = sync::target_lock_path(config, bucket_name)
      .map_err(|err| ResponseError::InternalServerError(err.to_string()))?;
    acquire_lock_file(
      path,
      "another import or sync finalization is already targeting this game bucket",
      "failed to lock sync target bucket",
    )
    .await
    .map(|path| Self { path })
  }
}

impl Drop for ImportTargetLock {
  fn drop(&mut self) {
    std::fs::remove_file(&self.path).ok();
  }
}

#[derive(Debug)]
struct MirrorCacheLock {
  path: PathBuf,
}

impl MirrorCacheLock {
  async fn acquire(
    config: &Option<r2s_config::bucket::Config>, instance_id: &str, game_key: &str,
  ) -> Result<Self, ResponseError> {
    let path = sync::mirror_lock_path(config, instance_id, game_key)
      .map_err(|err| ResponseError::InternalServerError(err.to_string()))?;
    acquire_lock_file(
      path,
      "another sync job is already refreshing the shared mirror cache for this release",
      "failed to lock shared mirror cache",
    )
    .await
    .map(|path| Self { path })
  }
}

impl Drop for MirrorCacheLock {
  fn drop(&mut self) {
    std::fs::remove_file(&self.path).ok();
  }
}

async fn acquire_lock_file(
  path: PathBuf, busy_message: &str, error_context: &str,
) -> Result<PathBuf, ResponseError> {
  if let Some(parent) = path.parent() {
    create_dir_all(parent).await?;
  }
  match StdOpenOptions::new()
    .write(true)
    .create_new(true)
    .open(&path)
  {
    Ok(_) => Ok(path),
    Err(err) if err.kind() == ErrorKind::AlreadyExists => {
      Err(ResponseError::Conflict(busy_message.to_owned()))
    }
    Err(err) => Err(ResponseError::InternalServerError(format!(
      "{error_context}: {err}"
    ))),
  }
}

#[derive(Clone, Serialize, Deserialize)]
struct DirectImportDiscovered {
  remote_info: RemoteSyncInfo,
  release: RemoteSyncReleaseDetail,
  manifest: manifest::ReleaseManifest,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct RemoteSyncInfo {
  pub instance_id: String,
  pub base_url: String,
  pub protocol_version: i32,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct RemoteSyncGameSummary {
  pub game_key: String,
  pub release_count: usize,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct RemoteSyncReleaseSummary {
  pub game_key: String,
  pub release_id: String,
  pub snapshot_commit: String,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  pub published_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct RemoteSyncReleaseDetail {
  pub game_key: String,
  pub release_id: String,
  pub snapshot_commit: String,
  pub manifest_sha256: String,
  pub manifest_body: String,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  pub published_at: i64,
}

#[derive(Serialize, Deserialize)]
pub(super) struct DirectDiscoverResponse {
  pub info: RemoteSyncInfo,
  pub games: Option<Vec<RemoteSyncGameSummary>>,
  pub releases: Option<Vec<RemoteSyncReleaseSummary>>,
  pub release: Option<RemoteSyncReleaseDetail>,
}

pub(super) async fn discover_remote_source(
  State(client): State<HTTPClient>, Json(req): Json<DirectDiscoverRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let base_url = normalize_base_url(&req.base_url)?;
  let token = normalized_sync_token(req.sync_token.as_deref());
  let info: RemoteSyncInfo = fetch_remote_json(&client, &base_url, "/info", token).await?;

  let response = if let Some(game_key) = req
    .game_key
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    if let Some(release_id) = req
      .release_id
      .as_deref()
      .map(str::trim)
      .filter(|value| !value.is_empty())
    {
      let release: RemoteSyncReleaseDetail = fetch_remote_json(
        &client,
        &base_url,
        &format!("/games/{game_key}/releases/{release_id}"),
        token,
      )
      .await?;
      DirectDiscoverResponse {
        info,
        games: None,
        releases: None,
        release: Some(release),
      }
    } else {
      let releases: Vec<RemoteSyncReleaseSummary> =
        fetch_remote_json(&client, &base_url, &format!("/games/{game_key}"), token).await?;
      DirectDiscoverResponse {
        info,
        games: None,
        releases: Some(releases),
        release: None,
      }
    }
  } else {
    let games: Vec<RemoteSyncGameSummary> =
      fetch_remote_json(&client, &base_url, "/games", token).await?;
    DirectDiscoverResponse {
      info,
      games: Some(games),
      releases: None,
      release: None,
    }
  };

  Ok(Json(response))
}

pub(super) async fn list_sync_jobs(
  State(ref db): State<Database>,
) -> Result<impl IntoResponse, ResponseError> {
  let jobs = game_sync_job::get_list(&db.conn).await?;
  Ok(Json(
    jobs
      .into_iter()
      .map(SyncJobResponse::from)
      .collect::<Vec<_>>(),
  ))
}

pub(super) async fn get_sync_job(
  State(ref db): State<Database>, axum::extract::Path(job_id): axum::extract::Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  let job = game_sync_job::get(&db.conn, job_id)
    .await?
    .ok_or(ResponseError::NotFound("sync job not found".to_owned()))?;
  Ok(Json(SyncJobDetailResponse::try_from(job)?))
}

pub(super) async fn cancel_sync_job(
  State(ref db): State<Database>, axum::extract::Path(job_id): axum::extract::Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  let job = game_sync_job::get(&db.conn, job_id)
    .await?
    .ok_or(ResponseError::NotFound("sync job not found".to_owned()))?;
  if !can_cancel_job(job.status.clone()) {
    return Err(ResponseError::Conflict(
      "only pending, running, or paused sync jobs can be cancelled".to_owned(),
    ));
  }
  let job = update_job(
    db,
    job,
    game_sync_job::SyncJobStatus::Cancelled,
    None,
    None,
    Some(Utc::now()),
    None,
  )
  .await?;
  Ok(Json(SyncJobResponse::from(job)))
}

pub(super) async fn resume_sync_job(
  State(state): State<GlobalState>, axum::extract::Path(job_id): axum::extract::Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  let job = game_sync_job::get(&state.db.conn, job_id)
    .await?
    .ok_or(ResponseError::NotFound("sync job not found".to_owned()))?;
  if !matches!(
    job.status.clone(),
    game_sync_job::SyncJobStatus::Failed
      | game_sync_job::SyncJobStatus::Paused
      | game_sync_job::SyncJobStatus::Cancelled
  ) {
    return Err(ResponseError::Conflict(
      "only failed, paused, or cancelled sync jobs can be resumed".to_owned(),
    ));
  }
  if let Some(game_key) = job.game_key.as_deref() {
    ensure_no_active_import_job(&state.db, game_key, Some(job.id)).await?;
  }
  let job = update_job(
    &state.db,
    job,
    game_sync_job::SyncJobStatus::Pending,
    Some("queued".to_owned()),
    None,
    None,
    None,
  )
  .await?;
  spawn_import_job(state.clone(), job.id);
  Ok(Json(SyncJobResponse::from(job)))
}

pub(super) async fn import_remote_release(
  State(state): State<GlobalState>, Extension(token): Extension<Token>,
  Json(req): Json<DirectImportRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let job = create_import_job(
    &state,
    token.id,
    game_sync_job::SyncJobMode::Direct,
    None,
    None,
    None,
    req,
  )
  .await?;
  spawn_import_job(state.clone(), job.id);
  Ok(Json(SyncJobResponse::from(job)))
}

pub(super) async fn create_import_job(
  state: &GlobalState, created_by: i64, mode: game_sync_job::SyncJobMode,
  registry_source_id: Option<i64>, upstream_instance_id: Option<String>,
  upstream_base_url: Option<String>, req: DirectImportRequest,
) -> Result<game_sync_job::Model, ResponseError> {
  let request = normalize_direct_import_request(req)?;
  let existing_target = resolve_import_target_game(&state.db, &request.game_key).await?;
  ensure_no_active_import_job(&state.db, &request.game_key, None).await?;

  let now = Utc::now();
  Ok(
    game_sync_job::create(
      &state.db.conn,
      game_sync_job::Model {
        id: 0,
        kind: game_sync_job::SyncJobKind::Import,
        mode,
        status: game_sync_job::SyncJobStatus::Pending,
        stage: "queued".to_owned(),
        game_id: existing_target.as_ref().map(|game| game.id),
        game_key: Some(request.game_key.clone()),
        release_id: Some(request.release_id.clone()),
        registry_source_id,
        upstream_instance_id,
        upstream_base_url: upstream_base_url.or_else(|| Some(request.base_url.clone())),
        request_body: game_sync_job::JsonObject(serde_json::to_value(&request)?),
        checkpoint: game_sync_job::JsonObject(json!({})),
        error_message: None,
        created_by,
        created_at: now,
        updated_at: now,
        finished_at: None,
      },
    )
    .await?,
  )
}

async fn resolve_import_target_game(
  db: &Database, game_key: &str,
) -> Result<Option<game::Model>, ResponseError> {
  let Some(existing_game) = game::get_by_sync_key(&db.conn, game_key).await? else {
    return Ok(None);
  };
  let Some(remote_sync) = game_remote_sync::get(&db.conn, existing_game.id).await? else {
    return Err(ResponseError::Conflict(
      "a local game with the same sync key already exists and is not a managed remote mirror"
        .to_owned(),
    ));
  };
  if remote_sync.state != game_remote_sync::RemoteGameState::MirrorLocked {
    return Err(ResponseError::Conflict(
      "only locked remote mirrors can be upgraded or re-synced in place".to_owned(),
    ));
  }
  Ok(Some(existing_game))
}

async fn load_import_target_game(
  db: &Database, game_id: i64,
) -> Result<game::Model, ResponseError> {
  game::get(&db.conn, game_id)
    .await?
    .ok_or(ResponseError::NotFound(
      "sync target game not found".to_owned(),
    ))
}

async fn maybe_refresh_registry_import_request(
  state: &GlobalState, mut job: game_sync_job::Model, request: &mut DirectImportRequest,
) -> Result<game_sync_job::Model, ResponseError> {
  if job.mode != game_sync_job::SyncJobMode::Registry {
    return Ok(job);
  }
  let Some(source_id) = job.registry_source_id else {
    return Ok(job);
  };
  let source = game_registry_source::get(&state.db.conn, source_id)
    .await?
    .ok_or(ResponseError::NotFound(
      "registry discovery source not found".to_owned(),
    ))?;
  let detail = registry::get_catalog_release_detail(
    &state.config.bucket,
    &source,
    &request.game_key,
    &request.release_id,
  )
  .await
  .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;
  let chosen_upstream = detail
    .upstreams
    .iter()
    .find(|upstream| {
      job.upstream_instance_id.as_deref() == Some(upstream.instance_id.as_str())
        || job.upstream_base_url.as_deref() == Some(upstream.base_url.as_str())
    })
    .or_else(|| detail.upstreams.first())
    .ok_or(ResponseError::PreconditionFailed(
      "no active upstream is currently available for this registry release".to_owned(),
    ))?;

  let next_request = DirectImportRequest {
    base_url: chosen_upstream.base_url.clone(),
    sync_token: Some(chosen_upstream.sync_token.clone()),
    game_key: request.game_key.clone(),
    release_id: request.release_id.clone(),
  };
  let needs_update = request.base_url != next_request.base_url
    || request.sync_token != next_request.sync_token
    || job.upstream_instance_id.as_deref() != Some(chosen_upstream.instance_id.as_str())
    || job.upstream_base_url.as_deref() != Some(chosen_upstream.base_url.as_str());
  if !needs_update {
    *request = next_request;
    return Ok(job);
  }

  *request = next_request.clone();
  let status = job.status.clone();
  job.request_body = game_sync_job::JsonObject(serde_json::to_value(&next_request)?);
  job.upstream_instance_id = Some(chosen_upstream.instance_id.clone());
  job.upstream_base_url = Some(chosen_upstream.base_url.clone());
  update_job(&state.db, job, status, None, None, None, None).await
}

pub(super) fn spawn_import_job(state: GlobalState, job_id: i64) {
  tokio::spawn(async move {
    if let Err(err) = run_direct_import_job(state.clone(), job_id).await
      && let Ok(Some(job)) = game_sync_job::get(&state.db.conn, job_id).await
      && job.status.clone() != game_sync_job::SyncJobStatus::Cancelled
    {
      let _ = update_job(
        &state.db,
        job,
        game_sync_job::SyncJobStatus::Failed,
        None,
        None,
        Some(Utc::now()),
        Some(err.to_string()),
      )
      .await;
    }
  });
}

async fn run_direct_import_job(state: GlobalState, job_id: i64) -> Result<(), ResponseError> {
  let mut job = game_sync_job::get(&state.db.conn, job_id)
    .await?
    .ok_or(ResponseError::NotFound("sync job not found".to_owned()))?;
  if job.status.clone() == game_sync_job::SyncJobStatus::Cancelled {
    return Ok(());
  }
  let mut request: DirectImportRequest =
    serde_json::from_value(job.request_body.0.clone()).map_err(ResponseError::from)?;
  let mut checkpoint = decode_checkpoint(&job.checkpoint.0)?;
  job = maybe_refresh_registry_import_request(&state, job, &mut request).await?;
  let workspace = sync::job_workspace_dir(&state.config.bucket, &job_id.to_string())
    .map_err(|err| ResponseError::InternalServerError(err.to_string()))?;
  let repo_dir = workspace.join("repo");
  create_dir_all(&workspace).await?;

  if checkpoint.discovered.is_none() {
    job = update_job(
      &state.db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some("discover".to_owned()),
      Some(&checkpoint),
      None,
      None,
    )
    .await?;
    let discovered = discover_release_for_import(&state.requestor, &request).await?;
    checkpoint.bucket_name = Some(match job.game_id {
      Some(game_id) => load_import_target_game(&state.db, game_id)
        .await?
        .bucket
        .ok_or(ResponseError::PreconditionFailed(
          "existing sync target does not have a game bucket".to_owned(),
        ))?,
      None => pick_local_bucket_name(&state.bucket, &request.game_key),
    });
    checkpoint.media.completed = discovered.manifest.assets.media_hashes.is_empty();
    checkpoint.oci.completed = discovered.manifest.assets.oci_images.is_empty();
    checkpoint.discovered = Some(discovered);
    job = update_job(
      &state.db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some("discover".to_owned()),
      Some(&checkpoint),
      None,
      None,
    )
    .await?;
  }

  if job_cancelled(&state.db, job_id).await? {
    return Ok(());
  }

  let discovered = checkpoint
    .discovered
    .clone()
    .ok_or(ResponseError::InternalServerError(
      "sync checkpoint lost discovered release metadata".to_owned(),
    ))?;

  if !checkpoint.repo.verified_snapshot || !repo_dir.exists() {
    ensure_repo_snapshot(
      &state.db,
      &state.config.bucket,
      &mut job,
      &mut checkpoint,
      &repo_dir,
      &request,
      &discovered.remote_info.instance_id,
      &discovered.release.snapshot_commit,
    )
    .await?;
  }

  if job_cancelled(&state.db, job_id).await? {
    return Ok(());
  }

  if !checkpoint.media.completed {
    job = download_release_media_resumable(
      &state.requestor,
      &state.db,
      &state.config.bucket,
      &state.media,
      &request.base_url,
      normalized_sync_token(request.sync_token.as_deref()),
      &discovered.manifest.assets.media_hashes,
      job.created_by,
      job,
      &mut checkpoint,
    )
    .await?;
  }

  if job_cancelled(&state.db, job_id).await? {
    return Ok(());
  }

  if !checkpoint.oci.completed {
    job = mirror_release_oci_images_resumable(&state, &request, &discovered, job, &mut checkpoint)
      .await?;
  }

  if job_cancelled(&state.db, job_id).await? {
    return Ok(());
  }

  let bucket_name = checkpoint
    .bucket_name
    .clone()
    .ok_or(ResponseError::InternalServerError(
      "sync checkpoint lost local bucket information".to_owned(),
    ))?;
  let _target_lock = ImportTargetLock::acquire(&state.config.bucket, &bucket_name).await?;
  let final_repo_path = state.bucket.path().join(&bucket_name);
  let live_backup_path = workspace.join("repo-live-backup");
  if job.game_id.is_some() {
    recover_existing_target_repo_state(&final_repo_path, &live_backup_path, &repo_dir).await?;
  }
  if final_repo_path.exists() && job.game_id.is_none() {
    if repo_dir.exists() {
      return Err(ResponseError::Conflict(
        "import finalization found both staged and live repositories for the same game bucket"
          .to_owned(),
      ));
    }
    rename(&final_repo_path, &repo_dir).await.map_err(|err| {
      ResponseError::InternalServerError(format!(
        "failed to recover staged repository from previous finalization attempt: {err}"
      ))
    })?;
  }
  if !repo_dir.exists() {
    checkpoint.repo = RepoCheckpoint::default();
    ensure_repo_snapshot(
      &state.db,
      &state.config.bucket,
      &mut job,
      &mut checkpoint,
      &repo_dir,
      &request,
      &discovered.remote_info.instance_id,
      &discovered.release.snapshot_commit,
    )
    .await?;
  }

  job = update_job(
    &state.db,
    job,
    game_sync_job::SyncJobStatus::Running,
    Some("finalize:move_repo".to_owned()),
    Some(&checkpoint),
    None,
    None,
  )
  .await?;

  if final_repo_path.exists() && job.game_id.is_none() {
    return Err(ResponseError::Conflict(
      "target game bucket already exists and can not be replaced during import finalization"
        .to_owned(),
    ));
  }

  if job.game_id.is_some() && final_repo_path.exists() {
    rename(&final_repo_path, &live_backup_path)
      .await
      .map_err(|err| {
        ResponseError::InternalServerError(format!(
          "failed to stage existing repository for mirror upgrade: {err}"
        ))
      })?;
  }

  rename(&repo_dir, &final_repo_path).await.map_err(|err| {
    ResponseError::InternalServerError(format!("failed to finalize imported repository: {err}"))
  })?;
  let finalize_result = match job.game_id {
    Some(game_id) => {
      finalize_import_into_existing(
        &state,
        job.created_by,
        game_id,
        &bucket_name,
        &discovered.remote_info,
        discovered.release,
        discovered.manifest,
      )
      .await
    }
    None => {
      finalize_import(
        &state,
        job.created_by,
        &bucket_name,
        &discovered.remote_info,
        discovered.release,
        discovered.manifest,
      )
      .await
    }
  };
  match finalize_result {
    Ok((game, _release)) => {
      if live_backup_path.exists() {
        remove_dir_all(&live_backup_path).await.ok();
      }
      remove_dir_all(&workspace).await.ok();
      job.game_id = Some(game.id);
      let _job = update_job(
        &state.db,
        job,
        game_sync_job::SyncJobStatus::Completed,
        Some("completed".to_owned()),
        Some(&checkpoint),
        Some(Utc::now()),
        None,
      )
      .await?;
      Ok(())
    }
    Err(err) => {
      if final_repo_path.exists() {
        rename(&final_repo_path, &repo_dir).await.ok();
      }
      if live_backup_path.exists() {
        rename(&live_backup_path, &final_repo_path).await.ok();
      }
      Err(err)
    }
  }
}

async fn recover_existing_target_repo_state(
  final_repo_path: &Path, live_backup_path: &Path, repo_dir: &Path,
) -> Result<(), ResponseError> {
  if !live_backup_path.exists() {
    return Ok(());
  }
  if repo_dir.exists() {
    return Err(ResponseError::Conflict(
      "sync workspace contains both staged and backup repositories for the same mirror upgrade"
        .to_owned(),
    ));
  }
  if !final_repo_path.exists() {
    return Err(ResponseError::Conflict(
      "mirror upgrade backup exists but the live repository is missing".to_owned(),
    ));
  }
  rename(final_repo_path, repo_dir).await.map_err(|err| {
    ResponseError::InternalServerError(format!(
      "failed to recover staged repository after interrupted mirror upgrade: {err}"
    ))
  })?;
  rename(live_backup_path, final_repo_path)
    .await
    .map_err(|err| {
      ResponseError::InternalServerError(format!(
        "failed to restore live repository after interrupted mirror upgrade: {err}"
      ))
    })?;
  Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn ensure_repo_snapshot(
  db: &Database, bucket_config: &Option<r2s_config::bucket::Config>,
  job: &mut game_sync_job::Model, checkpoint: &mut DirectImportCheckpoint, repo_dir: &Path,
  request: &DirectImportRequest, remote_instance_id: &str, snapshot_commit: &str,
) -> Result<(), ResponseError> {
  sync_repo_checkpoint_from_disk(repo_dir, snapshot_commit, &mut checkpoint.repo).await?;
  let mirror_dir = ensure_shared_mirror_cache(
    bucket_config,
    db,
    job,
    checkpoint,
    request,
    remote_instance_id,
  )
  .await?;
  if !checkpoint.repo.initialized {
    *job = update_job(
      db,
      job.clone(),
      game_sync_job::SyncJobStatus::Running,
      Some("fetch_repo:init".to_owned()),
      Some(checkpoint),
      None,
      None,
    )
    .await?;
    if repo_dir.exists() {
      remove_dir_all(repo_dir).await.ok();
    }
    let repo_dir_str = repo_dir.to_string_lossy().to_string();
    run_git(
      None,
      None,
      &[
        "clone".to_owned(),
        "--no-checkout".to_owned(),
        mirror_dir.to_string_lossy().to_string(),
        repo_dir_str,
      ],
    )
    .await?;
    checkpoint.repo.initialized = true;
  }
  if !checkpoint.repo.fetched_release_ref {
    *job = update_job(
      db,
      job.clone(),
      game_sync_job::SyncJobStatus::Running,
      Some("fetch_repo:fetch".to_owned()),
      Some(checkpoint),
      None,
      None,
    )
    .await?;
    run_git(
      Some(repo_dir),
      None,
      &[
        "remote".to_owned(),
        "set-url".to_owned(),
        "origin".to_owned(),
        mirror_dir.to_string_lossy().to_string(),
      ],
    )
    .await?;
    let release_ref = manifest::release_ref(&request.release_id);
    run_git(
      Some(repo_dir),
      None,
      &[
        "fetch".to_owned(),
        "--force".to_owned(),
        "--no-tags".to_owned(),
        "origin".to_owned(),
        format!("{release_ref}:{release_ref}"),
      ],
    )
    .await?;
    checkpoint.repo.fetched_release_ref = true;
  }
  if !checkpoint.repo.checked_out_snapshot {
    *job = update_job(
      db,
      job.clone(),
      game_sync_job::SyncJobStatus::Running,
      Some("fetch_repo:checkout".to_owned()),
      Some(checkpoint),
      None,
      None,
    )
    .await?;
    run_git(
      Some(repo_dir),
      None,
      &[
        "checkout".to_owned(),
        "--detach".to_owned(),
        snapshot_commit.to_owned(),
      ],
    )
    .await?;
    checkpoint.repo.checked_out_snapshot = true;
  }
  if !checkpoint.repo.verified_snapshot {
    *job = update_job(
      db,
      job.clone(),
      game_sync_job::SyncJobStatus::Running,
      Some("fetch_repo:verify".to_owned()),
      Some(checkpoint),
      None,
      None,
    )
    .await?;
    let git = Git::try_open(repo_dir).await?;
    let head = git.get_head().await?;
    if head != snapshot_commit {
      return Err(ResponseError::Conflict(
        "fetched repository head does not match the release snapshot".to_owned(),
      ));
    }
    checkpoint.repo.verified_snapshot = true;
  }
  *job = update_job(
    db,
    job.clone(),
    game_sync_job::SyncJobStatus::Running,
    Some("fetch_repo:done".to_owned()),
    Some(checkpoint),
    None,
    None,
  )
  .await?;
  Ok(())
}

async fn ensure_shared_mirror_cache(
  bucket_config: &Option<r2s_config::bucket::Config>, db: &Database,
  job: &mut game_sync_job::Model, checkpoint: &mut DirectImportCheckpoint,
  request: &DirectImportRequest, remote_instance_id: &str,
) -> Result<PathBuf, ResponseError> {
  let _mirror_lock =
    MirrorCacheLock::acquire(bucket_config, remote_instance_id, &request.game_key).await?;
  let mirror_dir = sync::mirror_cache_dir(bucket_config, remote_instance_id, &request.game_key)
    .map_err(|err| ResponseError::InternalServerError(err.to_string()))?;
  if let Some(parent) = mirror_dir.parent() {
    create_dir_all(parent).await?;
  }
  if mirror_dir.exists() && !mirror_dir.join("HEAD").exists() {
    remove_dir_all(&mirror_dir).await.ok();
  }
  if !mirror_dir.exists() {
    *job = update_job(
      db,
      job.clone(),
      game_sync_job::SyncJobStatus::Running,
      Some("fetch_repo:init".to_owned()),
      Some(checkpoint),
      None,
      None,
    )
    .await?;
    run_git(
      None,
      None,
      &[
        "init".to_owned(),
        "--bare".to_owned(),
        mirror_dir.to_string_lossy().to_string(),
      ],
    )
    .await?;
  }
  *job = update_job(
    db,
    job.clone(),
    game_sync_job::SyncJobStatus::Running,
    Some("fetch_repo:fetch".to_owned()),
    Some(checkpoint),
    None,
    None,
  )
  .await?;
  let repo_url = format!(
    "{}/api/sync/v1/games/{}/releases/{}/repo",
    request.base_url, request.game_key, request.release_id
  );
  let release_ref = manifest::release_ref(&request.release_id);
  run_git(
    Some(&mirror_dir),
    normalized_sync_token(request.sync_token.as_deref()),
    &[
      "fetch".to_owned(),
      "--force".to_owned(),
      "--no-tags".to_owned(),
      repo_url,
      format!("{release_ref}:{release_ref}"),
    ],
  )
  .await?;
  Ok(mirror_dir)
}

async fn sync_repo_checkpoint_from_disk(
  repo_dir: &Path, snapshot_commit: &str, repo: &mut RepoCheckpoint,
) -> Result<(), ResponseError> {
  let git_dir = repo_dir.join(".git");
  if !git_dir.exists() {
    return Ok(());
  }
  repo.initialized = true;
  let git = Git::try_open(repo_dir).await?;
  if let Ok(release_head) = git.get_head().await
    && release_head == snapshot_commit
  {
    repo.fetched_release_ref = true;
    repo.checked_out_snapshot = true;
    repo.verified_snapshot = true;
  }
  Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn download_release_media_resumable(
  client: &HTTPClient, db: &Database, bucket_config: &Option<r2s_config::bucket::Config>,
  media_store: &Media, base_url: &str, sync_token: Option<&str>, media_hashes: &[String],
  uploader_id: i64, mut job: game_sync_job::Model, checkpoint: &mut DirectImportCheckpoint,
) -> Result<game_sync_job::Model, ResponseError> {
  let total = media_hashes.len();
  if total == 0 {
    checkpoint.media.completed = true;
    return update_job(
      db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some("fetch_media:0/0".to_owned()),
      Some(checkpoint),
      None,
      None,
    )
    .await;
  }

  for hash in media_hashes {
    if checkpoint.media.downloaded_hashes.contains(hash)
      || media::get_by_hash(&db.conn, hash).await?.is_some()
    {
      checkpoint.media.downloaded_hashes.insert(hash.clone());
      continue;
    }

    if job_cancelled(db, job.id).await? {
      return Ok(job);
    }

    let done_before = checkpoint.media.downloaded_hashes.len();
    job = update_job(
      db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some(format!("fetch_media:{done_before}/{total}")),
      Some(checkpoint),
      None,
      None,
    )
    .await?;

    let part_path = sync::media_part_path(bucket_config, hash)
      .map_err(|err| ResponseError::InternalServerError(err.to_string()))?;
    if let Some(parent) = part_path.parent() {
      create_dir_all(parent).await?;
    }
    let existing_size = if part_path.exists() {
      tokio::fs::metadata(&part_path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0)
    } else {
      0
    };
    let (status, body) = fetch_remote_body(
      client,
      base_url,
      &format!("/media/{hash}"),
      sync_token,
      (existing_size > 0).then_some(existing_size),
    )
    .await?;
    if !status.is_success() {
      let body = to_bytes(body, usize::MAX).await.map_err(|err| {
        ResponseError::BadRequest(format!("failed to read remote media response: {err}"))
      })?;
      return Err(ResponseError::PreconditionFailed(format!(
        "failed to download media {hash}: {}",
        String::from_utf8_lossy(&body)
      )));
    }
    let append = existing_size > 0 && status == axum::http::StatusCode::PARTIAL_CONTENT;
    let mut part_file = OpenOptions::new()
      .create(true)
      .write(true)
      .append(append)
      .truncate(!append)
      .open(&part_path)
      .await?;
    if append {
      part_file.seek(std::io::SeekFrom::End(0)).await?;
    }
    let mut reader = StreamReader::new(body.into_data_stream().map_err(std::io::Error::other));
    tokio::io::copy(&mut reader, &mut part_file).await?;
    part_file.flush().await?;
    drop(part_file);

    let model = media_store.save(File::open(&part_path).await?).await?;
    if model.hash != *hash {
      media_store.delete(&model.hash).await.ok();
      return Err(ResponseError::Conflict(format!(
        "downloaded media hash mismatch: expected {hash}, got {}",
        model.hash
      )));
    }
    if media::get_by_hash(&db.conn, &model.hash).await?.is_none() {
      media::create(
        &db.conn,
        media::Model {
          id: 0,
          hash: model.hash,
          uploader_id,
        },
      )
      .await?;
    }
    remove_file(&part_path).await.ok();
    checkpoint.media.downloaded_hashes.insert(hash.clone());
    job = update_job(
      db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some(format!(
        "fetch_media:{}/{}",
        checkpoint.media.downloaded_hashes.len(),
        total
      )),
      Some(checkpoint),
      None,
      None,
    )
    .await?;
  }

  checkpoint.media.completed = true;
  update_job(
    db,
    job,
    game_sync_job::SyncJobStatus::Running,
    Some(format!("fetch_media:{total}/{total}")),
    Some(checkpoint),
    None,
    None,
  )
  .await
}

async fn mirror_release_oci_images_resumable(
  state: &GlobalState, request: &DirectImportRequest, discovered: &DirectImportDiscovered,
  mut job: game_sync_job::Model, checkpoint: &mut DirectImportCheckpoint,
) -> Result<game_sync_job::Model, ResponseError> {
  let total = discovered.manifest.assets.oci_images.len();
  if total == 0 {
    checkpoint.oci.completed = true;
    return update_job(
      &state.db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some("fetch_oci:0/0".to_owned()),
      Some(checkpoint),
      None,
      None,
    )
    .await;
  }

  let registry = state
    .cluster
    .registry
    .as_ref()
    .ok_or(ResponseError::PreconditionFailed(
      "cluster registry is not available for internal-managed OCI sync".to_owned(),
    ))?;
  let bucket_name = checkpoint
    .bucket_name
    .as_deref()
    .ok_or(ResponseError::InternalServerError(
      "sync checkpoint lost local bucket information".to_owned(),
    ))?;

  for asset in &discovered.manifest.assets.oci_images {
    let asset_key = format!("{}@{}", asset.source_repository, asset.digest);
    if checkpoint.oci.mirrored_images.contains(&asset_key) {
      continue;
    }
    if job_cancelled(&state.db, job.id).await? {
      return Ok(job);
    }

    let done_before = checkpoint.oci.mirrored_images.len();
    job = update_job(
      &state.db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some(format!("fetch_oci:{done_before}/{total}")),
      Some(checkpoint),
      None,
      None,
    )
    .await?;

    let (repo_name, reference) = manifest::split_internal_tag_reference(&asset.internal_tag);
    let destination_repository = format!("{}/{}", bucket_name, repo_name.trim_matches('/'));
    registry
      .mirror_sync_image(SyncImageMirrorRequest {
        sync_base_url: &request.base_url,
        sync_token: normalized_sync_token(request.sync_token.as_deref()),
        game_key: &request.game_key,
        release_id: &request.release_id,
        source_repository: &asset.source_repository,
        source_digest: &asset.digest,
        destination_repository: &destination_repository,
        destination_reference: &reference,
      })
      .await
      .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;

    checkpoint.oci.mirrored_images.insert(asset_key);
    job = update_job(
      &state.db,
      job,
      game_sync_job::SyncJobStatus::Running,
      Some(format!(
        "fetch_oci:{}/{}",
        checkpoint.oci.mirrored_images.len(),
        total
      )),
      Some(checkpoint),
      None,
      None,
    )
    .await?;
  }

  checkpoint.oci.completed = true;
  update_job(
    &state.db,
    job,
    game_sync_job::SyncJobStatus::Running,
    Some(format!("fetch_oci:{total}/{total}")),
    Some(checkpoint),
    None,
    None,
  )
  .await
}

async fn discover_release_for_import(
  client: &HTTPClient, request: &DirectImportRequest,
) -> Result<DirectImportDiscovered, ResponseError> {
  let remote_info: RemoteSyncInfo = fetch_remote_json(
    client,
    &request.base_url,
    "/info",
    normalized_sync_token(request.sync_token.as_deref()),
  )
  .await?;
  if remote_info.protocol_version != 1 {
    return Err(ResponseError::PreconditionFailed(format!(
      "unsupported remote sync protocol version {}",
      remote_info.protocol_version
    )));
  }
  let release: RemoteSyncReleaseDetail = fetch_remote_json(
    client,
    &request.base_url,
    &format!(
      "/games/{}/releases/{}",
      request.game_key, request.release_id
    ),
    normalized_sync_token(request.sync_token.as_deref()),
  )
  .await?;
  let manifest: manifest::ReleaseManifest = r2s_config::toml::from_str(&release.manifest_body)
    .map_err(|err| ResponseError::PreconditionFailed(format!("invalid release manifest: {err}")))?;
  if sha256sum_str(&release.manifest_body) != release.manifest_sha256 {
    return Err(ResponseError::Conflict(
      "remote release manifest hash does not match the manifest body".to_owned(),
    ));
  }
  validate_release_detail(&request.game_key, &request.release_id, &release, &manifest)?;
  if manifest.game.host_type != "game" {
    return Err(ResponseError::PreconditionFailed(
      "only archived games are supported by direct sync import in this phase".to_owned(),
    ));
  }
  Ok(DirectImportDiscovered {
    remote_info,
    release,
    manifest,
  })
}

fn normalize_direct_import_request(
  req: DirectImportRequest,
) -> Result<DirectImportRequest, ResponseError> {
  let base_url = normalize_base_url(&req.base_url)?;
  let game_key = req.game_key.trim().to_owned();
  let release_id = req.release_id.trim().to_owned();
  if game_key.is_empty() || release_id.is_empty() {
    return Err(ResponseError::BadRequest(
      "game key and release id are required".to_owned(),
    ));
  }
  Ok(DirectImportRequest {
    base_url,
    sync_token: normalized_sync_token(req.sync_token.as_deref()).map(str::to_owned),
    game_key,
    release_id,
  })
}

async fn ensure_no_active_import_job(
  db: &Database, game_key: &str, exclude_job_id: Option<i64>,
) -> Result<(), ResponseError> {
  for job in game_sync_job::get_list(&db.conn).await? {
    if job.kind != game_sync_job::SyncJobKind::Import {
      continue;
    }
    if exclude_job_id.is_some_and(|job_id| job.id == job_id) {
      continue;
    }
    if job.game_key.as_deref() != Some(game_key) {
      continue;
    }
    if matches!(
      job.status.clone(),
      game_sync_job::SyncJobStatus::Pending
        | game_sync_job::SyncJobStatus::Running
        | game_sync_job::SyncJobStatus::Paused
    ) {
      return Err(ResponseError::Conflict(
        "another import job for the same game is already active".to_owned(),
      ));
    }
  }
  Ok(())
}

async fn job_cancelled(db: &Database, job_id: i64) -> Result<bool, ResponseError> {
  Ok(
    game_sync_job::get(&db.conn, job_id)
      .await?
      .is_some_and(|job| job.status.clone() == game_sync_job::SyncJobStatus::Cancelled),
  )
}

fn decode_checkpoint(value: &Value) -> Result<DirectImportCheckpoint, ResponseError> {
  serde_json::from_value(value.clone()).map_err(ResponseError::from)
}

async fn update_job(
  db: &Database, mut job: game_sync_job::Model, status: game_sync_job::SyncJobStatus,
  stage: Option<String>, checkpoint: Option<&DirectImportCheckpoint>,
  finished_at: Option<chrono::DateTime<Utc>>, error_message: Option<String>,
) -> Result<game_sync_job::Model, ResponseError> {
  job.status = status;
  if let Some(stage) = stage {
    job.stage = stage;
  }
  if let Some(checkpoint) = checkpoint {
    job.checkpoint = game_sync_job::JsonObject(serde_json::to_value(checkpoint)?);
  }
  job.finished_at = finished_at;
  job.error_message = error_message;
  Ok(game_sync_job::update(&db.conn, job).await?)
}

impl From<game_sync_job::Model> for SyncJobResponse {
  fn from(value: game_sync_job::Model) -> Self {
    let status = value.status.clone();
    Self {
      id: value.id,
      mode: value.mode.into(),
      status: status.clone().into(),
      stage: value.stage,
      game_id: value.game_id,
      game_key: value.game_key,
      release_id: value.release_id,
      registry_source_id: value.registry_source_id,
      upstream_instance_id: value.upstream_instance_id,
      upstream_base_url: value.upstream_base_url,
      error_message: value.error_message,
      can_resume: can_resume_job(status.clone()),
      can_cancel: can_cancel_job(status),
      created_at: value.created_at,
      updated_at: value.updated_at,
      finished_at: value.finished_at,
    }
  }
}

impl From<DirectImportRequest> for SyncJobRequestView {
  fn from(value: DirectImportRequest) -> Self {
    Self {
      base_url: value.base_url,
      has_sync_token: value.sync_token.is_some(),
      game_key: value.game_key,
      release_id: value.release_id,
    }
  }
}

impl From<RepoCheckpoint> for SyncJobRepoCheckpointView {
  fn from(value: RepoCheckpoint) -> Self {
    Self {
      initialized: value.initialized,
      fetched_release_ref: value.fetched_release_ref,
      checked_out_snapshot: value.checked_out_snapshot,
      verified_snapshot: value.verified_snapshot,
    }
  }
}

impl From<DirectImportCheckpoint> for SyncJobCheckpointView {
  fn from(value: DirectImportCheckpoint) -> Self {
    let discovered = value.discovered.map(|discovered| SyncJobDiscoveredView {
      remote_instance_id: discovered.remote_info.instance_id,
      remote_base_url: discovered.remote_info.base_url,
      protocol_version: discovered.remote_info.protocol_version,
      snapshot_commit: discovered.release.snapshot_commit,
      manifest_sha256: discovered.release.manifest_sha256,
      first_party_instance_id: discovered.release.first_party_instance_id,
      first_party_base_url: discovered.release.first_party_base_url,
      published_at: discovered.release.published_at,
      media_total: discovered.manifest.assets.media_hashes.len(),
      oci_total: discovered.manifest.assets.oci_images.len(),
    });
    let media_total = discovered
      .as_ref()
      .map_or(value.media.downloaded_hashes.len(), |item| item.media_total);
    let oci_total = discovered
      .as_ref()
      .map_or(value.oci.mirrored_images.len(), |item| item.oci_total);
    Self {
      bucket_name: value.bucket_name,
      discovered,
      repo: value.repo.into(),
      media: SyncJobAssetCheckpointView {
        done: value.media.downloaded_hashes.len(),
        total: media_total,
        completed: value.media.completed,
      },
      oci: SyncJobAssetCheckpointView {
        done: value.oci.mirrored_images.len(),
        total: oci_total,
        completed: value.oci.completed,
      },
    }
  }
}

impl TryFrom<game_sync_job::Model> for SyncJobDetailResponse {
  type Error = ResponseError;

  fn try_from(value: game_sync_job::Model) -> Result<Self, Self::Error> {
    let request: DirectImportRequest =
      serde_json::from_value(value.request_body.0.clone()).map_err(ResponseError::from)?;
    let checkpoint = decode_checkpoint(&value.checkpoint.0)?;
    Ok(Self {
      job: value.into(),
      request: request.into(),
      checkpoint: checkpoint.into(),
    })
  }
}

fn can_resume_job(status: game_sync_job::SyncJobStatus) -> bool {
  matches!(
    status,
    game_sync_job::SyncJobStatus::Failed
      | game_sync_job::SyncJobStatus::Paused
      | game_sync_job::SyncJobStatus::Cancelled
  )
}

fn can_cancel_job(status: game_sync_job::SyncJobStatus) -> bool {
  matches!(
    status,
    game_sync_job::SyncJobStatus::Pending
      | game_sync_job::SyncJobStatus::Running
      | game_sync_job::SyncJobStatus::Paused
  )
}

async fn finalize_import(
  state: &GlobalState, importer_id: i64, bucket_name: &str, remote_info: &RemoteSyncInfo,
  release: RemoteSyncReleaseDetail, manifest: manifest::ReleaseManifest,
) -> Result<(game::Model, game_release::Model), ResponseError> {
  let txn = state.db.conn.begin().await?;
  let published_at = DateTime::from_timestamp(release.published_at, 0).ok_or(
    ResponseError::PreconditionFailed("invalid release published timestamp".to_owned()),
  )?;

  let game = game::create(
    &txn,
    build_imported_game(importer_id, bucket_name, &manifest),
  )
  .await?;
  import_challenges(&txn, &state.bucket, bucket_name, &game, &manifest).await?;

  let local_release = game_release::create(
    &txn,
    game_release::Model {
      id: 0,
      game_id: game.id,
      game_key: manifest.game_key.clone(),
      release_id: manifest.release_id.clone(),
      snapshot_commit: manifest.snapshot_commit.clone(),
      manifest_sha256: release.manifest_sha256.clone(),
      manifest_body: release.manifest_body.clone(),
      origin_role: game_release::OriginRole::Mirror,
      first_party_instance_id: release.first_party_instance_id.clone(),
      first_party_base_url: release.first_party_base_url.clone(),
      published_at,
      created_at: Utc::now(),
    },
  )
  .await?;

  game_remote_sync::create(
    &txn,
    game_remote_sync::Model {
      game_id: game.id,
      state: game_remote_sync::RemoteGameState::MirrorLocked,
      current_release_id: manifest.release_id.clone(),
      snapshot_commit: manifest.snapshot_commit.clone(),
      manifest_sha256: release.manifest_sha256,
      manifest_body: release.manifest_body,
      first_party_instance_id: release.first_party_instance_id,
      first_party_base_url: release.first_party_base_url,
      selected_upstream_instance_id: remote_info.instance_id.clone(),
      selected_upstream_base_url: remote_info.base_url.clone(),
      last_synced_at: Utc::now(),
      detached_at: None,
      detached_by: None,
    },
  )
  .await?;

  txn.commit().await?;
  Ok((game, local_release))
}

async fn finalize_import_into_existing(
  state: &GlobalState, importer_id: i64, game_id: i64, bucket_name: &str,
  remote_info: &RemoteSyncInfo, release: RemoteSyncReleaseDetail,
  manifest: manifest::ReleaseManifest,
) -> Result<(game::Model, game_release::Model), ResponseError> {
  let txn = state.db.conn.begin().await?;
  let published_at = DateTime::from_timestamp(release.published_at, 0).ok_or(
    ResponseError::PreconditionFailed("invalid release published timestamp".to_owned()),
  )?;
  let current_game = game::get(&txn, game_id)
    .await?
    .ok_or(ResponseError::NotFound(
      "sync target game not found".to_owned(),
    ))?;
  let current_remote_sync =
    game_remote_sync::get(&txn, game_id)
      .await?
      .ok_or(ResponseError::Conflict(
        "existing sync target is missing its remote mirror state".to_owned(),
      ))?;
  if current_remote_sync.state != game_remote_sync::RemoteGameState::MirrorLocked {
    return Err(ResponseError::Conflict(
      "only locked remote mirrors can be upgraded or re-synced in place".to_owned(),
    ));
  }
  if current_game.sync_key.as_deref() != Some(manifest.game_key.as_str()) {
    return Err(ResponseError::Conflict(
      "existing sync target no longer matches the requested game key".to_owned(),
    ));
  }

  let mut imported_game = build_imported_game(importer_id, bucket_name, &manifest);
  let mut admins = current_game.admins.0.clone();
  if !admins.contains(&importer_id) {
    admins.push(importer_id);
  }
  imported_game.id = current_game.id;
  imported_game.bucket = current_game.bucket.clone();
  imported_game.token = current_game.token.clone();
  imported_game.sync_key = current_game
    .sync_key
    .clone()
    .or_else(|| Some(manifest.game_key.clone()));
  imported_game.sync_token = current_game.sync_token.clone().or(imported_game.sync_token);
  imported_game.admins = game::Admins(admins);
  imported_game.hidden = current_game.hidden;
  let game = game::update(&txn, imported_game).await?;

  for existing_challenge in challenge::get_full_list(&txn, game.id).await? {
    challenge::delete(&txn, existing_challenge.id).await?;
  }
  import_challenges(&txn, &state.bucket, bucket_name, &game, &manifest).await?;

  let local_release =
    match game_release::get_by_game_and_release(&txn, game.id, &manifest.release_id).await? {
      Some(existing) => {
        if existing.manifest_sha256 != release.manifest_sha256 {
          return Err(ResponseError::Conflict(
            "this release id is already recorded with different manifest content".to_owned(),
          ));
        }
        existing
      }
      None => {
        game_release::create(
          &txn,
          game_release::Model {
            id: 0,
            game_id: game.id,
            game_key: manifest.game_key.clone(),
            release_id: manifest.release_id.clone(),
            snapshot_commit: manifest.snapshot_commit.clone(),
            manifest_sha256: release.manifest_sha256.clone(),
            manifest_body: release.manifest_body.clone(),
            origin_role: game_release::OriginRole::Mirror,
            first_party_instance_id: release.first_party_instance_id.clone(),
            first_party_base_url: release.first_party_base_url.clone(),
            published_at,
            created_at: Utc::now(),
          },
        )
        .await?
      }
    };

  game_remote_sync::update(
    &txn,
    game_remote_sync::Model {
      game_id: game.id,
      state: game_remote_sync::RemoteGameState::MirrorLocked,
      current_release_id: manifest.release_id.clone(),
      snapshot_commit: manifest.snapshot_commit.clone(),
      manifest_sha256: release.manifest_sha256,
      manifest_body: release.manifest_body,
      first_party_instance_id: release.first_party_instance_id,
      first_party_base_url: release.first_party_base_url,
      selected_upstream_instance_id: remote_info.instance_id.clone(),
      selected_upstream_base_url: remote_info.base_url.clone(),
      last_synced_at: Utc::now(),
      detached_at: None,
      detached_by: None,
    },
  )
  .await?;

  txn.commit().await?;
  Ok((game, local_release))
}

async fn import_challenges(
  txn: &sea_orm::DatabaseTransaction, bucket: &Bucket, bucket_name: &str, game: &game::Model,
  manifest: &manifest::ReleaseManifest,
) -> Result<(), ResponseError> {
  let game_bucket = bucket.at(bucket_name).await?;
  let manifest_challenges: BTreeMap<_, _> = manifest
    .challenges
    .iter()
    .map(|challenge| (challenge.key.as_str(), challenge))
    .collect();
  let bucket_dirs = list_challenge_dirs(&game_bucket).await?;
  if bucket_dirs.len() != manifest_challenges.len() {
    return Err(ResponseError::PreconditionFailed(
      "challenge directories do not match the release manifest".to_owned(),
    ));
  }

  for bucket_key in bucket_dirs {
    let Some(manifest_challenge) = manifest_challenges.get(bucket_key.as_str()) else {
      return Err(ResponseError::PreconditionFailed(format!(
        "challenge `{bucket_key}` is missing from the release manifest"
      )));
    };
    let challenge_bucket = game_bucket.at(&bucket_key).await?;
    validate_import_env(&challenge_bucket).await?;
    let config = challenge_bucket.config().await?;
    let challenge = challenge::create(
      txn,
      challenge::Model {
        id: 0,
        name: config.name,
        updated_at: Utc::now(),
        content: Some(challenge_bucket.description().await?),
        hidden: manifest_challenge.hidden,
        game_id: game.id,
        tag: serde_json::from_value(serde_json::to_value(config.tag).map_err(ResponseError::from)?)
          .map_err(ResponseError::from)?,
        score_rule: serde_json::from_value(
          serde_json::to_value(config.score_rule).map_err(ResponseError::from)?,
        )
        .map_err(ResponseError::from)?,
        score: manifest_challenge.score,
        display_order: manifest_challenge.order,
        bucket: Some(bucket_key.clone()),
        ref_id: None,
        release_at: manifest_challenge.release_at,
        archive_at: manifest_challenge.archive_at,
      },
    )
    .await?;
    for bucket_hint in challenge_bucket.hints().await?.hints {
      hint::create(
        txn,
        hint::Model {
          id: 0,
          created_at: Utc::now(),
          challenge_id: challenge.id,
          content: bucket_hint.content,
          cost: bucket_hint.cost,
        },
      )
      .await?;
    }
  }
  Ok(())
}

fn build_imported_game(
  importer_id: i64, bucket_name: &str, manifest: &manifest::ReleaseManifest,
) -> game::Model {
  let host_type = match manifest.game.host_type.as_str() {
    "game" => game::HostType::Game,
    "training" => game::HostType::Training,
    _ => game::HostType::Game,
  };
  game::Model {
    id: 0,
    updated_at: Utc::now(),
    name: manifest.game.name.clone(),
    brief: manifest.game.brief.clone(),
    introduction_id: None,
    start_at: manifest.game.start_at,
    end_at: manifest.game.end_at,
    register_at: manifest.game.register_at,
    archive_at: manifest.game.archive_at,
    hidden: true,
    offline: false,
    frozen: false,
    host_type,
    team_size: manifest.game.team_size,
    access_policy: game::AccessPolicy {
      restrict: false,
      institutes: vec![],
      sync: manifest.game.sync_policy,
    },
    archive_policy: game::ArchivePolicy {
      challenge: game::ArchivePolicyChallenge {
        show_answer: manifest.game.show_answer_after_archive,
        show_hints: manifest.game.show_hints_after_archive,
      },
    },
    cover: manifest.game.cover_value.clone(),
    logo: manifest.game.logo_value.clone(),
    enable_audit: false,
    can_register_after_started: manifest.game.can_register_after_started,
    award_rate: 0,
    award_rates: Some(game::AwardRates(vec![0, 0, 0])),
    admins: game::Admins(vec![importer_id]),
    weight: manifest.game.weight,
    bucket: Some(bucket_name.to_owned()),
    token: Some(nanoid::nanoid!()),
    sync_key: Some(manifest.game_key.clone()),
    sync_token: Some(nanoid::nanoid!()),
    timeline_presets: None,
    node_selector: None,
    traffic: None,
    lifecycle: None,
    hammer_policy: game::HammerPolicy::default(),
  }
}

async fn fetch_remote_body(
  client: &HTTPClient, base_url: &str, path: &str, token: Option<&str>, range_start: Option<u64>,
) -> Result<(axum::http::StatusCode, Body), ResponseError> {
  let uri = Uri::try_from(format!("{base_url}/api/sync/v1{path}"))
    .map_err(|err| ResponseError::BadRequest(format!("invalid remote sync uri: {err}")))?;
  let mut request = Request::builder().method(Method::GET).uri(uri);
  if let Some(token) = token {
    request = request.header(
      AUTHORIZATION,
      HeaderValue::from_str(&format!("Bearer {token}"))
        .map_err(|err| ResponseError::BadRequest(format!("invalid sync token header: {err}")))?,
    );
  }
  if let Some(range_start) = range_start {
    request = request.header(RANGE, format!("bytes={range_start}-"));
  }
  let request = request.body(Body::empty()).map_err(|err| {
    ResponseError::InternalServerError(format!("failed to build sync request: {err}"))
  })?;
  let response = client.request(request).await.map_err(|err| {
    ResponseError::BadRequest(format!("failed to reach remote sync endpoint: {err}"))
  })?;
  let status = response.status();
  Ok((status, Body::new(response.into_body())))
}

async fn fetch_remote_json<T: serde::de::DeserializeOwned>(
  client: &HTTPClient, base_url: &str, path: &str, token: Option<&str>,
) -> Result<T, ResponseError> {
  let (status, body) = fetch_remote_body(client, base_url, path, token, None).await?;
  let body = to_bytes(body, usize::MAX).await.map_err(|err| {
    ResponseError::BadRequest(format!("failed to read remote sync response: {err}"))
  })?;
  if !status.is_success() {
    let body_text = String::from_utf8_lossy(&body);
    return Err(ResponseError::PreconditionFailed(format!(
      "remote sync endpoint returned {status}: {body_text}"
    )));
  }
  serde_json::from_slice(&body).map_err(ResponseError::from)
}

fn validate_release_detail(
  game_key: &str, release_id: &str, release: &RemoteSyncReleaseDetail,
  manifest: &manifest::ReleaseManifest,
) -> Result<(), ResponseError> {
  if release.game_key != game_key
    || release.release_id != release_id
    || manifest.game_key != game_key
    || manifest.release_id != release_id
  {
    return Err(ResponseError::Conflict(
      "remote release metadata does not match the requested game key or release id".to_owned(),
    ));
  }
  if release.snapshot_commit != manifest.snapshot_commit {
    return Err(ResponseError::Conflict(
      "remote release metadata does not match the manifest snapshot".to_owned(),
    ));
  }
  Ok(())
}

fn normalized_sync_token(sync_token: Option<&str>) -> Option<&str> {
  sync_token.map(str::trim).filter(|token| !token.is_empty())
}

fn normalize_base_url(base_url: &str) -> Result<String, ResponseError> {
  let base_url = base_url.trim().trim_end_matches('/');
  if base_url.is_empty() {
    return Err(ResponseError::BadRequest(
      "remote base url can not be empty".to_owned(),
    ));
  }
  if !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
    return Err(ResponseError::BadRequest(
      "remote base url must start with http:// or https://".to_owned(),
    ));
  }
  Ok(base_url.to_owned())
}

fn pick_local_bucket_name(bucket: &Bucket, game_key: &str) -> String {
  let base = sanitize_bucket_seed(game_key);
  if !bucket.path().join(&base).exists() {
    return base;
  }
  for index in 1..=9999 {
    let candidate = format!("{base}_{index}");
    if !bucket.path().join(&candidate).exists() {
      return candidate;
    }
  }
  format!("{}_{}", base, &nanoid::nanoid!()[..8])
}

fn sanitize_bucket_seed(value: &str) -> String {
  let normalized = deunicode_with_tofu(value, "_")
    .trim()
    .to_owned()
    .to_snake_case()
    .chars()
    .map(|ch| {
      if ch.is_ascii_alphanumeric() || ch == '_' {
        ch
      } else {
        '_'
      }
    })
    .collect::<String>();
  let normalized = normalized.trim_matches('_');
  let normalized = if normalized.is_empty() {
    "synced_game".to_owned()
  } else {
    normalized.to_owned()
  };
  if normalized.len() > 72 {
    normalized[..72].to_owned()
  } else {
    normalized
  }
}

async fn list_challenge_dirs(
  game_bucket: &r2s_bucket::game::GameBucket,
) -> Result<Vec<String>, ResponseError> {
  let challenges_root = game_bucket.git.path().join("challenges");
  let mut entries = read_dir(&challenges_root).await.map_err(|err| {
    ResponseError::InternalServerError(format!(
      "failed to read imported challenge directory {}: {err}",
      challenges_root.display()
    ))
  })?;
  let mut result = Vec::new();
  while let Some(entry) = entries.next_entry().await? {
    if !entry.file_type().await?.is_dir() {
      continue;
    }
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    result.push(name);
  }
  result.sort();
  Ok(result)
}

async fn validate_import_env(
  challenge_bucket: &r2s_bucket::challenge::ChallengeBucket,
) -> Result<(), ResponseError> {
  let Some(env) = challenge_bucket.env().await? else {
    return Ok(());
  };
  let mut ports = std::collections::HashSet::new();
  for image in env.images {
    if let Some(port) = image.port
      && !ports.insert(port)
    {
      return Err(ResponseError::PreconditionFailed(format!(
        "challenge `{}` has conflicting ports in env.toml",
        challenge_bucket.name
      )));
    }
  }
  Ok(())
}

async fn run_git(
  current_dir: Option<&Path>, sync_token: Option<&str>, args: &[String],
) -> Result<(), ResponseError> {
  let mut cmd = Command::new("git");
  if let Some(current_dir) = current_dir {
    cmd.current_dir(current_dir);
  }
  if let Some(sync_token) = sync_token {
    cmd.arg("-c").arg(format!(
      "http.extraHeader=Authorization: Bearer {sync_token}"
    ));
  }
  cmd.args(args);
  let output = cmd.output().await?;
  if output.status.success() {
    Ok(())
  } else {
    Err(ResponseError::PreconditionFailed(
      String::from_utf8_lossy(&output.stderr).to_string(),
    ))
  }
}

#[cfg(test)]
mod tests {
  use super::{normalize_base_url, sanitize_bucket_seed, validate_release_detail};
  use crate::sync::manifest::{ChallengeManifest, GameManifest, ManifestAssets, ReleaseManifest};

  #[test]
  fn normalize_base_url_trims_trailing_slashes() {
    assert_eq!(
      normalize_base_url(" https://example.com/ ").expect("normalize base url"),
      "https://example.com"
    );
  }

  #[test]
  fn normalize_base_url_rejects_invalid_scheme() {
    let err = normalize_base_url("example.com").expect_err("invalid base url should fail");
    assert!(format!("{err}").contains("http:// or https://"));
  }

  #[test]
  fn sanitize_bucket_seed_produces_stable_ascii_bucket_name() {
    assert_eq!(
      sanitize_bucket_seed("Example Game 2024"),
      "example_game_2024"
    );
  }

  #[test]
  fn validate_release_detail_rejects_mismatched_snapshot() {
    let err = validate_release_detail(
      "game_key",
      "release_id",
      &super::RemoteSyncReleaseDetail {
        game_key: "game_key".to_owned(),
        release_id: "release_id".to_owned(),
        snapshot_commit: "deadbeef".to_owned(),
        manifest_sha256: "hash".to_owned(),
        manifest_body: String::new(),
        first_party_instance_id: "instance".to_owned(),
        first_party_base_url: "https://example.com".to_owned(),
        published_at: 0,
      },
      &ReleaseManifest {
        spec_version: 1,
        kind: "release".to_owned(),
        game_key: "game_key".to_owned(),
        release_id: "release_id".to_owned(),
        snapshot_commit: "another".to_owned(),
        published_at: chrono::DateTime::UNIX_EPOCH,
        first_party_instance_id: "instance".to_owned(),
        game: GameManifest {
          name: "name".to_owned(),
          brief: "brief".to_owned(),
          host_type: "game".to_owned(),
          start_at: chrono::DateTime::UNIX_EPOCH,
          end_at: chrono::DateTime::UNIX_EPOCH,
          register_at: chrono::DateTime::UNIX_EPOCH,
          archive_at: chrono::DateTime::UNIX_EPOCH,
          team_size: 1,
          weight: 1,
          sync_policy: 0,
          can_register_after_started: true,
          cover_kind: None,
          cover_value: None,
          logo_kind: None,
          logo_value: None,
          show_answer_after_archive: false,
          show_hints_after_archive: false,
        },
        challenges: vec![ChallengeManifest {
          key: "challenge".to_owned(),
          order: 1,
          hidden: false,
          score: 100,
          release_at: None,
          archive_at: None,
        }],
        assets: ManifestAssets::default(),
      },
    )
    .expect_err("snapshot mismatch should fail");

    assert!(format!("{err}").contains("manifest snapshot"));
  }
}

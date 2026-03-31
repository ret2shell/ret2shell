use axum::{Extension, Json, extract::State, response::IntoResponse};
use chrono::Utc;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_cluster::Cluster;
use r2s_config::GlobalConfig;
use r2s_database::{game, game_registry_source, game_release, game_remote_sync};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};

use crate::{
  middleware::auth::Token,
  routes::game::ensure_game_sync_writable,
  sync::{self, manifest, registry},
  traits::ResponseError,
};

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum RemoteSyncStateView {
  MirrorLocked,
  Detached,
}

impl From<game_remote_sync::RemoteGameState> for RemoteSyncStateView {
  fn from(value: game_remote_sync::RemoteGameState) -> Self {
    match value {
      game_remote_sync::RemoteGameState::MirrorLocked => Self::MirrorLocked,
      game_remote_sync::RemoteGameState::Detached => Self::Detached,
    }
  }
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum ReleaseOriginRoleView {
  FirstParty,
  Mirror,
}

impl From<game_release::OriginRole> for ReleaseOriginRoleView {
  fn from(value: game_release::OriginRole) -> Self {
    match value {
      game_release::OriginRole::FirstParty => Self::FirstParty,
      game_release::OriginRole::Mirror => Self::Mirror,
    }
  }
}

#[derive(Serialize)]
pub(super) struct GameSyncStatusResponse {
  pub sync_key: Option<String>,
  pub sync_token: Option<String>,
  pub readonly: bool,
  pub remote_state: Option<RemoteSyncStateView>,
  pub remote_release_id: Option<String>,
  pub remote_first_party_base_url: Option<String>,
}

#[derive(Serialize)]
pub(super) struct GameReleaseResponse {
  pub id: i64,
  pub game_id: i64,
  pub game_key: String,
  pub release_id: String,
  pub snapshot_commit: String,
  pub manifest_sha256: String,
  pub origin_role: ReleaseOriginRoleView,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub published_at: chrono::DateTime<Utc>,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub created_at: chrono::DateTime<Utc>,
}

#[derive(Serialize)]
pub(super) struct RegistrySourceResponse {
  pub id: i64,
  pub name: String,
  pub git_url: String,
  pub branch: String,
  pub enabled: bool,
  pub priority: i32,
  #[serde(with = "chrono::serde::ts_seconds_option")]
  pub last_fetched_at: Option<chrono::DateTime<Utc>>,
  pub last_error: Option<String>,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub created_at: chrono::DateTime<Utc>,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Serialize)]
pub(super) struct RegistryPublicationMetadataResponse {
  pub release: GameReleaseResponse,
  pub release_file_path: String,
  pub release_file_content: String,
  pub upstream_file_path: String,
  pub upstream_file_content: String,
}

#[derive(Serialize)]
pub(super) struct RegistryUpstreamMetadataResponse {
  pub release: GameReleaseResponse,
  pub upstream_file_path: String,
  pub upstream_file_content: String,
}

#[derive(Default, Deserialize)]
pub(super) struct PublishGameReleaseRequest {}

#[derive(Default, Deserialize)]
pub(super) struct AdvertiseUpstreamRequest {}

#[derive(Deserialize)]
pub(super) struct DetachRemoteSyncRequest {
  pub reason: Option<String>,
}

#[derive(Serialize)]
pub(super) struct SyncTokenResponse {
  pub sync_token: String,
}

pub(super) async fn get_game_sync_status(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(build_sync_status(&db.conn, &game).await?))
}

pub(super) async fn get_game_sync_releases(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let releases = game_release::get_list_by_game(&db.conn, game.id).await?;
  Ok(Json(
    releases
      .into_iter()
      .map(GameReleaseResponse::from)
      .collect::<Vec<_>>(),
  ))
}

pub(super) async fn get_game_sync_sources(
  State(ref db): State<Database>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(
    game_registry_source::get_list(&db.conn)
      .await?
      .into_iter()
      .map(RegistrySourceResponse::from)
      .collect::<Vec<_>>(),
  ))
}

pub(super) async fn rotate_game_sync_token(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  ensure_game_sync_writable(&db.conn, &game).await?;
  let sync_token = nanoid::nanoid!();
  let game = game::update(
    &db.conn,
    game::Model {
      sync_token: Some(sync_token.clone()),
      ..game
    },
  )
  .await?;
  cache.at("game").del(game.id).await.ok();
  Ok(Json(SyncTokenResponse { sync_token }))
}

pub(super) async fn detach_remote_sync_game(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, Json(_req): Json<DetachRemoteSyncRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let _ = _req.reason.as_deref();
  let remote_sync =
    game_remote_sync::get(&db.conn, game.id)
      .await?
      .ok_or(ResponseError::PreconditionFailed(
        "this game is not a remote mirror".to_owned(),
      ))?;
  if remote_sync.state != game_remote_sync::RemoteGameState::MirrorLocked {
    return Err(ResponseError::PreconditionFailed(
      "this remote mirror has already been detached".to_owned(),
    ));
  }

  game_remote_sync::update(
    &db.conn,
    game_remote_sync::Model {
      state: game_remote_sync::RemoteGameState::Detached,
      detached_at: Some(Utc::now()),
      detached_by: Some(token.id),
      ..remote_sync
    },
  )
  .await?;
  Ok(Json(build_sync_status(&db.conn, &game).await?))
}

pub(super) async fn advertise_remote_sync_upstream(
  State(config): State<GlobalConfig>, State(ref db): State<Database>,
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Json(_req): Json<AdvertiseUpstreamRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.access_policy.sync == 2 {
    return Err(ResponseError::PreconditionFailed(
      "this game has disabled sync metadata generation".to_owned(),
    ));
  }

  let remote_sync =
    game_remote_sync::get(&db.conn, game.id)
      .await?
      .ok_or(ResponseError::PreconditionFailed(
        "this game is not a remote mirror".to_owned(),
      ))?;
  if remote_sync.state != game_remote_sync::RemoteGameState::MirrorLocked {
    return Err(ResponseError::PreconditionFailed(
      "only locked remote mirrors may advertise themselves as third-party upstreams".to_owned(),
    ));
  }

  let release =
    game_release::get_by_game_and_release(&db.conn, game.id, &remote_sync.current_release_id)
      .await?
      .ok_or(ResponseError::PreconditionFailed(
        "current remote release record not found".to_owned(),
      ))?;
  if release.origin_role != game_release::OriginRole::Mirror {
    return Err(ResponseError::PreconditionFailed(
      "only mirrored releases may be advertised as third-party upstreams".to_owned(),
    ));
  }

  let bucket_name = game
    .bucket
    .clone()
    .ok_or(ResponseError::PreconditionFailed(
      "game bucket not found".to_owned(),
    ))?;
  let game_bucket = bucket.at(&bucket_name).await?;
  let release_ref = manifest::release_ref(&remote_sync.current_release_id);
  let release_ref_oid = game_bucket.git.get_ref(&release_ref).await?;
  if release_ref_oid.as_deref() != Some(remote_sync.snapshot_commit.as_str()) {
    return Err(ResponseError::Conflict(
      "current release ref is missing or no longer matches the mirrored snapshot".to_owned(),
    ));
  }

  let instance_id = sync::instance_id(&config.bucket)
    .await
    .map_err(|err| ResponseError::InternalServerError(err.to_string()))?;
  let base_url = config
    .server
    .as_ref()
    .ok_or(ResponseError::PreconditionFailed(
      "server configuration not found".to_owned(),
    ))?
    .external_origin();
  let sync_token = game
    .sync_token
    .clone()
    .ok_or(ResponseError::PreconditionFailed(
      "game sync token missing".to_owned(),
    ))?;
  let metadata =
    registry::build_registry_upstream_metadata(registry::RegistryUpstreamPublicationRequest {
      game_key: &release.game_key,
      release_id: &release.release_id,
      instance_id: &instance_id,
      role: "third_party",
      base_url: &base_url,
      sync_token: &sync_token,
      published_at: Utc::now(),
    })
    .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;

  Ok(Json(RegistryUpstreamMetadataResponse {
    release: GameReleaseResponse::from(release),
    upstream_file_path: metadata.upstream_file_path,
    upstream_file_content: metadata.upstream_file_content,
  }))
}

pub(super) async fn publish_game_release(
  State(config): State<GlobalConfig>, State(cluster): State<Cluster>,
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Json(_req): Json<PublishGameReleaseRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  ensure_game_sync_writable(&db.conn, &game).await?;
  if game.host_type != game::HostType::Game {
    return Err(ResponseError::PreconditionFailed(
      "only archived games can generate release publication metadata".to_owned(),
    ));
  }
  if !game.archived() {
    return Err(ResponseError::PreconditionFailed(
      "the game must be archived before release publication metadata can be generated".to_owned(),
    ));
  }
  if game.access_policy.sync == 2 {
    return Err(ResponseError::PreconditionFailed(
      "this game has disabled sync metadata generation".to_owned(),
    ));
  }

  let bucket_name = game
    .bucket
    .clone()
    .ok_or(ResponseError::PreconditionFailed(
      "game bucket not found".to_owned(),
    ))?;

  let current_game = ensure_sync_identity(&db.conn, &game).await?;
  let sync_token = current_game
    .sync_token
    .clone()
    .ok_or(ResponseError::PreconditionFailed(
      "game sync token missing".to_owned(),
    ))?;
  let repo_lock = bucket.lock(&bucket_name).map_err(|err| match err {
    r2s_bucket::BucketError::LockError => ResponseError::Conflict(
      "another repository write operation is already in progress for this game".to_owned(),
    ),
    other => other.into(),
  })?;
  let game_bucket = bucket.at(&bucket_name).await?;
  if !game_bucket.git.is_clean().await? {
    drop(repo_lock);
    return Err(ResponseError::Conflict(
      "the game repository has uncommitted changes; please finish syncing authoring changes first"
        .to_owned(),
    ));
  }

  let challenges = r2s_database::challenge::get_list(&db.conn, current_game.id, true).await?;
  let instance_id = sync::instance_id(&config.bucket)
    .await
    .map_err(|err| ResponseError::InternalServerError(err.to_string()))?;
  let published_at = Utc::now();
  let manifest = manifest::build_release_manifest(
    &current_game,
    &game_bucket,
    &challenges,
    current_game.sync_key.as_deref().unwrap_or(&bucket_name),
    &instance_id,
    published_at,
    cluster.registry.as_ref(),
  )
  .await
  .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;
  game_bucket
    .git
    .set_ref(
      manifest::release_ref(&manifest.release_id),
      &manifest.snapshot_commit,
    )
    .await?;
  drop(repo_lock);

  let base_url = config
    .server
    .as_ref()
    .ok_or(ResponseError::PreconditionFailed(
      "server configuration not found".to_owned(),
    ))?
    .external_origin();
  let metadata =
    registry::build_registry_publication_metadata(registry::RegistryPublicationRequest {
      game_key: current_game.sync_key.as_deref().unwrap_or(&bucket_name),
      release_id: &manifest.release_id,
      manifest_body: &manifest.manifest_body,
      instance_id: &instance_id,
      base_url: &base_url,
      sync_token: &sync_token,
      published_at,
    })
    .map_err(|err| ResponseError::PreconditionFailed(err.to_string()))?;

  let release =
    match game_release::get_by_game_and_release(&db.conn, current_game.id, &manifest.release_id)
      .await?
    {
      Some(existing) => {
        if existing.manifest_sha256 != manifest.manifest_sha256 {
          return Err(ResponseError::Conflict(
            "this release id is already recorded with different manifest content".to_owned(),
          ));
        }
        existing
      }
      None => {
        game_release::create(
          &db.conn,
          game_release::Model {
            id: 0,
            game_id: current_game.id,
            game_key: current_game.sync_key.clone().unwrap_or(bucket_name),
            release_id: manifest.release_id.clone(),
            snapshot_commit: manifest.snapshot_commit.clone(),
            manifest_sha256: manifest.manifest_sha256.clone(),
            manifest_body: manifest.manifest_body.clone(),
            origin_role: game_release::OriginRole::FirstParty,
            first_party_instance_id: instance_id,
            first_party_base_url: base_url,
            published_at,
            created_at: Utc::now(),
          },
        )
        .await?
      }
    };
  cache.at("game").del(current_game.id).await.ok();
  Ok(Json(RegistryPublicationMetadataResponse {
    release: GameReleaseResponse::from(release),
    release_file_path: metadata.release_file_path,
    release_file_content: metadata.release_file_content,
    upstream_file_path: metadata.upstream_file_path,
    upstream_file_content: metadata.upstream_file_content,
  }))
}

impl From<game_release::Model> for GameReleaseResponse {
  fn from(value: game_release::Model) -> Self {
    Self {
      id: value.id,
      game_id: value.game_id,
      game_key: value.game_key,
      release_id: value.release_id,
      snapshot_commit: value.snapshot_commit,
      manifest_sha256: value.manifest_sha256,
      origin_role: value.origin_role.into(),
      first_party_instance_id: value.first_party_instance_id,
      first_party_base_url: value.first_party_base_url,
      published_at: value.published_at,
      created_at: value.created_at,
    }
  }
}

impl From<game_registry_source::Model> for RegistrySourceResponse {
  fn from(value: game_registry_source::Model) -> Self {
    Self {
      id: value.id,
      name: value.name,
      git_url: value.git_url,
      branch: value.branch,
      enabled: value.enabled,
      priority: value.priority,
      last_fetched_at: value.last_fetched_at,
      last_error: value.last_error,
      created_at: value.created_at,
      updated_at: value.updated_at,
    }
  }
}

async fn build_sync_status(
  db: &sea_orm::DatabaseConnection, game: &game::Model,
) -> Result<GameSyncStatusResponse, ResponseError> {
  let remote_sync = game_remote_sync::get(db, game.id).await?;
  let readonly = remote_sync.as_ref().is_some_and(|remote_sync| {
    remote_sync.state == game_remote_sync::RemoteGameState::MirrorLocked
  });

  Ok(GameSyncStatusResponse {
    sync_key: game.sync_key.clone(),
    sync_token: game.sync_token.clone(),
    readonly,
    remote_state: remote_sync
      .as_ref()
      .map(|remote_sync| remote_sync.state.clone().into()),
    remote_release_id: remote_sync
      .as_ref()
      .map(|remote_sync| remote_sync.current_release_id.clone()),
    remote_first_party_base_url: remote_sync
      .as_ref()
      .map(|remote_sync| remote_sync.first_party_base_url.clone()),
  })
}

async fn ensure_sync_identity(
  db: &sea_orm::DatabaseConnection, game: &game::Model,
) -> Result<game::Model, ResponseError> {
  let sync_key = game
    .sync_key
    .clone()
    .or_else(|| game.bucket.clone())
    .ok_or(ResponseError::PreconditionFailed(
      "game sync key can not be derived without bucket".to_owned(),
    ))?;
  let sync_token = game.sync_token.clone().unwrap_or_else(|| nanoid::nanoid!());
  if game.sync_key.as_deref() == Some(sync_key.as_str())
    && game.sync_token.as_deref() == Some(sync_token.as_str())
  {
    return Ok(game.clone());
  }
  Ok(
    game::update(
      db,
      game::Model {
        sync_key: Some(sync_key),
        sync_token: Some(sync_token),
        ..game.clone()
      },
    )
    .await?,
  )
}

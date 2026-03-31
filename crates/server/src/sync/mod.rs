use std::{
  collections::BTreeMap,
  path::{Path, PathBuf},
  time::{Duration, SystemTime},
};

use anyhow::{Context, anyhow};
use chrono::Utc;
use r2s_config::bucket;
use r2s_database::{challenge, game, game_registry_source, game_sync_job};
use r2s_migrator::Database;
use rand::Rng;
use sea_orm::{ActiveModelTrait, ActiveValue, ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use tokio::fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, remove_file, write};
use tracing::{info, warn};

const SYNC_DIR: &str = ".sync";
const LOCKS_DIR: &str = "locks";
const SOURCES_DIR: &str = "sources";
const MIRRORS_DIR: &str = "mirrors";
const JOBS_DIR: &str = "jobs";
const MEDIA_PART_DIR: &str = "media-part";
const INSTANCE_ID_FILE: &str = "instance-id";
const DEFAULT_SOURCE_NAME: &str = "ret2shell-official";
const DEFAULT_SOURCE_URL: &str = "https://github.com/ret2shell/game-registry";
const DEFAULT_SOURCE_BRANCH: &str = "main";
const CLEANUP_INTERVAL: Duration = Duration::from_secs(60 * 60);
const JOB_RETENTION_DAYS: i64 = 7;
const MEDIA_PART_RETENTION: Duration = Duration::from_secs(60 * 60 * 24 * 7);

pub mod manifest;
pub mod registry;

pub async fn initialize(db: &Database, config: &Option<bucket::Config>) -> anyhow::Result<()> {
  let root = sync_root(config)?;
  create_dir_all(root.join(LOCKS_DIR)).await?;
  create_dir_all(root.join(SOURCES_DIR)).await?;
  create_dir_all(root.join(MIRRORS_DIR)).await?;
  create_dir_all(root.join(JOBS_DIR)).await?;
  create_dir_all(root.join(MEDIA_PART_DIR)).await?;

  let instance_id = ensure_instance_id(&root).await?;
  backfill_game_sync_fields(db).await?;
  backfill_challenge_display_order(db).await?;
  ensure_default_registry_source(db).await?;

  info!(instance_id=%instance_id, path=%root.display(), "sync workspace initialized");
  Ok(())
}

pub fn sync_root(config: &Option<bucket::Config>) -> anyhow::Result<PathBuf> {
  let bucket_path = config
    .as_ref()
    .map(|config| PathBuf::from(&config.path))
    .ok_or_else(|| anyhow!("bucket configuration not found"))?;
  Ok(bucket_path.join(SYNC_DIR))
}

async fn ensure_instance_id(root: &Path) -> anyhow::Result<String> {
  let path = root.join(INSTANCE_ID_FILE);
  if let Ok(existing) = read_to_string(&path).await {
    let existing = existing.trim().to_owned();
    if !existing.is_empty() {
      return Ok(existing);
    }
  }

  let instance_id = generate_instance_id();
  write(&path, format!("{instance_id}\n")).await?;
  Ok(instance_id)
}

pub async fn instance_id(config: &Option<bucket::Config>) -> anyhow::Result<String> {
  let root = sync_root(config)?;
  ensure_instance_id(&root).await
}

pub fn source_cache_dir(
  config: &Option<bucket::Config>, source_id: i64,
) -> anyhow::Result<PathBuf> {
  Ok(
    sync_root(config)?
      .join(SOURCES_DIR)
      .join(source_id.to_string()),
  )
}

pub fn job_workspace_dir(config: &Option<bucket::Config>, job_id: &str) -> anyhow::Result<PathBuf> {
  Ok(sync_root(config)?.join(JOBS_DIR).join(job_id))
}

pub fn mirror_cache_dir(
  config: &Option<bucket::Config>, instance_id: &str, game_key: &str,
) -> anyhow::Result<PathBuf> {
  Ok(
    sync_root(config)?
      .join(MIRRORS_DIR)
      .join(sanitize_cache_component(instance_id))
      .join(format!("{}.git", sanitize_cache_component(game_key))),
  )
}

pub fn mirror_lock_path(
  config: &Option<bucket::Config>, instance_id: &str, game_key: &str,
) -> anyhow::Result<PathBuf> {
  Ok(sync_root(config)?.join(LOCKS_DIR).join(format!(
    "mirror-{}-{}.lock",
    sanitize_cache_component(instance_id),
    sanitize_cache_component(game_key)
  )))
}

pub fn media_part_path(config: &Option<bucket::Config>, hash: &str) -> anyhow::Result<PathBuf> {
  Ok(
    sync_root(config)?
      .join(MEDIA_PART_DIR)
      .join(format!("{hash}.part")),
  )
}

pub fn target_lock_path(
  config: &Option<bucket::Config>, bucket_name: &str,
) -> anyhow::Result<PathBuf> {
  Ok(
    sync_root(config)?
      .join(LOCKS_DIR)
      .join(format!("{bucket_name}.lock")),
  )
}

pub fn spawn_cleanup_worker(db: Database, config: Option<bucket::Config>) {
  tokio::spawn(async move {
    loop {
      if let Err(err) = cleanup_workspace(&db, &config).await {
        warn!(error=?err, "failed to clean sync workspace");
      }
      tokio::time::sleep(CLEANUP_INTERVAL).await;
    }
  });
}

fn sanitize_cache_component(value: &str) -> String {
  let sanitized = value
    .chars()
    .map(|ch| {
      if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
        ch
      } else {
        '_'
      }
    })
    .collect::<String>();
  let sanitized = sanitized.trim_matches('_');
  if sanitized.is_empty() {
    "unknown".to_owned()
  } else {
    sanitized.to_owned()
  }
}

async fn cleanup_workspace(db: &Database, config: &Option<bucket::Config>) -> anyhow::Result<()> {
  let root = sync_root(config)?;
  cleanup_job_workspaces(db, &root).await?;
  cleanup_media_parts(&root).await?;
  Ok(())
}

async fn cleanup_job_workspaces(db: &Database, root: &Path) -> anyhow::Result<()> {
  let finished_before = Utc::now() - chrono::Duration::days(JOB_RETENTION_DAYS);
  let jobs_by_id = game_sync_job::get_list(&db.conn)
    .await?
    .into_iter()
    .map(|job| (job.id.to_string(), job))
    .collect::<BTreeMap<_, _>>();
  let job_root = root.join(JOBS_DIR);
  let mut entries = match read_dir(&job_root).await {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(err) => return Err(err.into()),
  };
  while let Some(entry) = entries.next_entry().await? {
    if !entry.file_type().await?.is_dir() {
      continue;
    }
    let job_key = entry.file_name().to_string_lossy().to_string();
    let should_keep = jobs_by_id.get(&job_key).is_some_and(|job| {
      job
        .finished_at
        .map(|finished_at| finished_at >= finished_before)
        .unwrap_or(true)
    });
    if !should_keep {
      remove_dir_all(entry.path()).await.ok();
    }
  }
  Ok(())
}

async fn cleanup_media_parts(root: &Path) -> anyhow::Result<()> {
  let cutoff = SystemTime::now() - MEDIA_PART_RETENTION;
  let media_part_root = root.join(MEDIA_PART_DIR);
  let mut entries = match read_dir(&media_part_root).await {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(err) => return Err(err.into()),
  };
  while let Some(entry) = entries.next_entry().await? {
    if !entry.file_type().await?.is_file() {
      continue;
    }
    let modified = entry
      .metadata()
      .await?
      .modified()
      .unwrap_or(SystemTime::UNIX_EPOCH);
    if modified < cutoff {
      remove_file(entry.path()).await.ok();
    }
  }
  Ok(())
}

fn generate_instance_id() -> String {
  let mut bytes = [0_u8; 16];
  rand::rng().fill_bytes(&mut bytes);
  bytes[6] = (bytes[6] & 0x0F) | 0x40;
  bytes[8] = (bytes[8] & 0x3F) | 0x80;

  format!(
    "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
    bytes[5],
    bytes[6],
    bytes[7],
    bytes[8],
    bytes[9],
    bytes[10],
    bytes[11],
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15]
  )
}

async fn backfill_game_sync_fields(db: &Database) -> anyhow::Result<()> {
  let games = game::Entity::find()
    .filter(game::Column::HostType.eq(game::HostType::Game))
    .all(&db.conn)
    .await?;

  for current in games {
    let next_sync_key = current.sync_key.clone().or_else(|| current.bucket.clone());
    let next_sync_token = current
      .sync_token
      .clone()
      .or_else(|| Some(nanoid::nanoid!()));

    if next_sync_key == current.sync_key && next_sync_token == current.sync_token {
      continue;
    }

    let model = game::ActiveModel {
      id: ActiveValue::Unchanged(current.id),
      sync_key: ActiveValue::Set(next_sync_key),
      sync_token: ActiveValue::Set(next_sync_token),
      ..Default::default()
    };
    model.update(&db.conn).await.with_context(|| {
      format!(
        "failed to backfill game sync fields for game {}",
        current.id
      )
    })?;
  }

  Ok(())
}

async fn backfill_challenge_display_order(db: &Database) -> anyhow::Result<()> {
  let challenges = challenge::Entity::find()
    .order_by_asc(challenge::Column::GameId)
    .order_by_asc(challenge::Column::Id)
    .all(&db.conn)
    .await?;

  let mut previous_game_id = None;
  let mut display_order = 0_i32;
  for current in challenges {
    if previous_game_id != Some(current.game_id) {
      previous_game_id = Some(current.game_id);
      display_order = 1;
    } else {
      display_order += 1;
    }

    if current.display_order == display_order {
      continue;
    }

    let model = challenge::ActiveModel {
      id: ActiveValue::Unchanged(current.id),
      display_order: ActiveValue::Set(display_order),
      ..Default::default()
    };
    model.update(&db.conn).await.with_context(|| {
      format!(
        "failed to backfill challenge display order for challenge {}",
        current.id
      )
    })?;
  }

  Ok(())
}

async fn ensure_default_registry_source(db: &Database) -> anyhow::Result<()> {
  let existing = game_registry_source::get_list(&db.conn).await?;
  if existing.iter().any(|source| {
    source.name == DEFAULT_SOURCE_NAME
      || (source.git_url == DEFAULT_SOURCE_URL && source.branch == DEFAULT_SOURCE_BRANCH)
  }) {
    return Ok(());
  }

  game_registry_source::create(
    &db.conn,
    game_registry_source::Model {
      id: 0,
      name: DEFAULT_SOURCE_NAME.to_owned(),
      git_url: DEFAULT_SOURCE_URL.to_owned(),
      branch: DEFAULT_SOURCE_BRANCH.to_owned(),
      enabled: true,
      priority: 0,
      publish_enabled: false,
      private_source: false,
      last_fetched_at: None,
      last_error: None,
      created_at: Utc::now(),
      updated_at: Utc::now(),
    },
  )
  .await?;

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::{generate_instance_id, sanitize_cache_component};

  #[test]
  fn generated_instance_id_looks_like_uuid_v4() {
    let id = generate_instance_id();
    assert_eq!(id.len(), 36);
    assert_eq!(&id[8..9], "-");
    assert_eq!(&id[13..14], "-");
    assert_eq!(&id[18..19], "-");
    assert_eq!(&id[23..24], "-");
    assert_eq!(&id[14..15], "4");
    assert!(matches!(&id[19..20], "8" | "9" | "a" | "b"));
  }

  #[test]
  fn sanitize_cache_component_replaces_path_separators() {
    assert_eq!(
      sanitize_cache_component("official/source"),
      "official_source"
    );
    assert_eq!(sanitize_cache_component(" "), "unknown");
  }
}

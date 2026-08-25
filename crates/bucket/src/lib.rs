use std::path::PathBuf;

use deunicode::deunicode_with_tofu;
use game::{GameConfig, RepoLock};
use heck::ToSnakeCase;
use r2s_config::bucket;
use serde_json::Value;
use tokio::fs::{create_dir_all, remove_dir_all};
use tracing::{debug, error, warn};
pub use traits::BucketError;

pub mod challenge;
pub mod game;
pub mod git;
pub mod traits;
pub use challenge::Hint;

#[derive(Clone, Debug)]
pub struct Bucket {
  path: PathBuf,
}

impl Bucket {
  async fn check_git_safe_directories(&self) -> Result<i32, BucketError> {
    // get all child directories, and try open it with git
    let mut count = 0;
    for entry in std::fs::read_dir(&self.path).map_err(BucketError::IoError)? {
      let entry = entry.map_err(BucketError::IoError)?;
      if entry.file_type().map_err(BucketError::IoError)?.is_dir() {
        let dir_path = entry.path();
        match git::Git::try_open(&dir_path).await {
          Ok(_) => {
            debug!(path=?dir_path, "game bucket is valid");
            continue;
          }
          Err(e) => {
            warn!(path=?dir_path, error=?e, "game bucket is invalid");
            count += 1;
          }
        }
      }
    }
    Ok(count)
  }

  pub async fn open(path: PathBuf) -> Self {
    let result = Self { path };
    match result.check_git_safe_directories().await {
      Ok(count) => {
        if count > 0 {
          warn!(
            count,
            "found invalid game buckets in the bucket path, some games may not be accessible"
          );
        }
      }
      Err(e) => {
        error!(error=?e, "failed to check game buckets, games may not be accessible");
      }
    }
    result
  }

  pub async fn create(&self, game: Value) -> Result<game::GameBucket, BucketError> {
    let game_config: GameConfig = serde_json::from_value(game)?;
    let game_name = deunicode_with_tofu(game_config.name.as_ref(), "_")
      .trim()
      .to_owned()
      .to_snake_case();
    let game_name = if game_name.len() > 72 {
      game_name[..72].to_owned()
    } else {
      game_name
    };
    let game_bucket_name = format!("{}_{:x}", game_name, game_config.start_at.timestamp());
    match game::GameBucket::new(&self.path, &game_bucket_name, game_config).await {
      Ok(bucket) => Ok(bucket),
      Err(BucketError::PathConflict(_)) => {
        error!(game=?game_name, bucket=?game_bucket_name, "game bucket path conflict");
        Err(BucketError::PathConflict(game_bucket_name))
      }
      Err(e) => {
        error!(game=?game_name, bucket=?game_bucket_name, error=?e, "failed to create game bucket");
        // cleanup the failed created game bucket
        // it may not exist so we ignore the error
        remove_dir_all(self.path.join(&game_bucket_name)).await.ok();
        Err(e)
      }
    }
  }

  pub async fn at(&self, name: impl AsRef<str>) -> Result<game::GameBucket, BucketError> {
    game::GameBucket::open(&self.path, name, false).await
  }

  pub async fn at_mut(&self, name: impl AsRef<str>) -> Result<game::GameBucket, BucketError> {
    game::GameBucket::open(&self.path, name, true).await
  }

  pub fn lock(&self, name: impl AsRef<str>) -> Result<RepoLock, BucketError> {
    RepoLock::acquire(self.path.join(name.as_ref()))
  }

  pub async fn delete(&self, name: impl AsRef<str>) -> Result<(), BucketError> {
    let _ = self.at(&name).await?;
    remove_dir_all(self.path.join(name.as_ref())).await?;
    Ok(())
  }
}

pub async fn initialize(config: &Option<bucket::Config>) -> Result<Bucket, BucketError> {
  if let Some(config) = config {
    let path: PathBuf = config.path.clone().into();
    if !path.exists() {
      create_dir_all(&path).await.map_err(BucketError::IoError)?;
    }
    Ok(Bucket::open(path).await)
  } else {
    Err(BucketError::ConfigNotFound)
  }
}

pub async fn down(config: &Option<bucket::Config>) -> Result<(), BucketError> {
  if let Some(config) = config {
    let path: PathBuf = config.path.clone().into();
    if !path.exists() {
      Ok(())
    } else {
      remove_dir_all(path)
        .await
        .map(|_| ())
        .map_err(BucketError::IoError)
    }
  } else {
    Err(BucketError::ConfigNotFound)
  }
}

#[cfg(test)]
mod tests {
  use std::time::{SystemTime, UNIX_EPOCH};

  use chrono::{Duration, Utc};
  use serde_json::json;

  use super::Bucket;
  use crate::traits::BucketError;

  fn temp_root(label: &str) -> std::path::PathBuf {
    crate::game::tests::ensure_git_identity_env();
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    std::env::temp_dir().join(format!(
      "r2s-bucket-test-{label}-{}-{nanos}",
      std::process::id()
    ))
  }

  fn game_json(name: &str, start_offset_seconds: i64) -> serde_json::Value {
    let now = Utc::now();
    json!({
      "name": name,
      "updated_at": now.timestamp(),
      "brief": "test game",
      "start_at": (now + Duration::seconds(start_offset_seconds)).timestamp(),
      "end_at": (now + Duration::days(2)).timestamp(),
      "register_at": now.timestamp(),
      "archive_at": (now + Duration::days(3)).timestamp(),
      "host_type": 1,
      "team_size": 4,
      "env_limit": null,
      "access_policy": { "sync": 0 },
      "cover": null,
      "logo": null,
      "can_register_after_started": false,
      "award_rate": 100,
      "weight": 1,
    })
  }

  #[tokio::test]
  async fn create_derives_snake_case_bucket_names_with_timestamp_suffix() {
    let root = temp_root("create");
    let bucket = Bucket { path: root.clone() };

    let start_at = Utc::now() + Duration::days(1);
    let created = bucket
      .create(game_json_with_start("My Cool Game", start_at))
      .await
      .unwrap();

    assert_eq!(
      created.name,
      format!("my_cool_game_{:x}", start_at.timestamp())
    );
    assert!(root.join(&created.name).join("config.toml").exists());

    // the same name at the same timestamp collides with the first bucket.
    let err = bucket
      .create(game_json_with_start("My Cool Game", start_at))
      .await
      .unwrap_err();
    assert!(matches!(err, BucketError::PathConflict(_)));

    // names longer than 72 bytes are truncated before the suffix.
    let long = bucket
      .create(game_json_with_start("a".repeat(100).as_str(), start_at))
      .await
      .unwrap();
    assert!(long.name.starts_with(&"a".repeat(72)));
    assert_eq!(long.name[73..], format!("{:x}", start_at.timestamp()));

    std::fs::remove_dir_all(root).ok();
  }

  fn game_json_with_start(name: &str, start_at: chrono::DateTime<Utc>) -> serde_json::Value {
    let mut value = game_json(name, 0);
    value["start_at"] = json!(start_at.timestamp());
    value["updated_at"] = json!(Utc::now().timestamp());
    value
  }

  #[tokio::test]
  async fn open_lock_and_delete_round_trip() {
    let root = temp_root("open");
    let bucket = Bucket { path: root.clone() };
    let created = bucket.create(game_json("Readable Game", 0)).await.unwrap();

    // read-only handle works without a lock file.
    let handle = bucket.at(created.name.as_str()).await.unwrap();
    assert_eq!(handle.name, created.name);
    drop(handle);

    // only one writer can hold the lock at a time; dropping releases it.
    let writer = bucket.at_mut(created.name.as_str()).await.unwrap();
    let second = bucket.at_mut(created.name.as_str()).await;
    assert!(matches!(second, Err(BucketError::LockError)));
    assert!(matches!(
      bucket.lock(created.name.as_str()),
      Err(BucketError::LockError)
    ));
    drop(writer);
    let writer = bucket.at_mut(created.name.as_str()).await.unwrap();
    drop(writer);

    bucket.delete(created.name.as_str()).await.unwrap();
    assert!(!root.join(created.name.as_str()).exists());

    // deleting an unknown bucket reports it as missing instead of removing
    // anything.
    let err = bucket.delete("no_such_bucket").await.unwrap_err();
    assert!(matches!(err, BucketError::PathDoesNotExist(_)));

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn initialize_requires_config_and_down_is_idempotent_for_missing_paths() {
    let missing = r2s_config::bucket::Config {
      path: "/nonexistent/ret2shell-bucket-test".to_owned(),
    };

    assert!(matches!(
      super::initialize(&None).await,
      Err(BucketError::ConfigNotFound)
    ));

    let root = temp_root("initialize");
    let initialized = super::initialize(&Some(missing)).await;
    assert!(initialized.is_err()); // sanity: nonexistent paths cannot be scanned

    // down on a missing path succeeds; on an existing path it removes the tree.
    assert!(super::down(&None).await.is_err());
    std::fs::create_dir_all(&root).unwrap();
    let config = Some(r2s_config::bucket::Config {
      path: root.to_string_lossy().to_string(),
    });
    super::down(&config).await.unwrap();
    assert!(!root.exists());
    assert!(super::down(&config).await.is_ok());

    std::fs::remove_dir_all(root).ok();
  }
}

use std::path::PathBuf;

use deunicode::deunicode_with_tofu;
use game::GameConfig;
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

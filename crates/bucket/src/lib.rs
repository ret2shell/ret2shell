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

struct ImportPathGuard(PathBuf);

impl Drop for ImportPathGuard {
  fn drop(&mut self) {
    std::fs::remove_dir_all(&self.0).ok();
  }
}

fn game_bucket_name(game: &GameConfig) -> String {
  let game_name = deunicode_with_tofu(game.name.as_ref(), "_")
    .trim()
    .to_owned()
    .to_snake_case();
  let game_name = if game_name.len() > 72 {
    game_name[..72].to_owned()
  } else {
    game_name
  };
  format!("{}_{:x}", game_name, game.start_at.timestamp())
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
    let game_name = game_config.name.clone();
    let game_bucket_name = game_bucket_name(&game_config);
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

  pub async fn import_game(
    &self, repository_url: &str, bearer_token: Option<&str>,
  ) -> Result<game::GameBucket, BucketError> {
    let temporary_name = format!(
      ".sync-import-{}-{}",
      std::process::id(),
      chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let temporary_path = self.path.join(&temporary_name);
    let _temporary_guard = ImportPathGuard(temporary_path.clone());
    #[cfg(not(test))]
    let cloned = git::Git::clone(repository_url, &temporary_path, bearer_token).await?;
    #[cfg(test)]
    let cloned = git::Git::clone_for_test(repository_url, &temporary_path, bearer_token).await?;
    drop(cloned);
    let game_config = match async {
      let game_bucket = game::GameBucket::open(&self.path, &temporary_name, false).await?;
      game_bucket.config().await
    }
    .await
    {
      Ok(config) => config,
      Err(error) => {
        remove_dir_all(&temporary_path).await.ok();
        return Err(error);
      }
    };
    let game_bucket_name = game_bucket_name(&game_config);
    let final_path = self.path.join(&game_bucket_name);
    if final_path.exists() {
      remove_dir_all(&temporary_path).await.ok();
      return Err(BucketError::PathConflict(game_bucket_name));
    }
    if let Err(error) = tokio::fs::rename(&temporary_path, &final_path).await {
      remove_dir_all(&temporary_path).await.ok();
      return Err(error.into());
    }
    match game::GameBucket::open(&self.path, &game_bucket_name, true).await {
      Ok(bucket) => Ok(bucket),
      Err(error) => {
        remove_dir_all(&final_path).await.ok();
        Err(error)
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

#[cfg(all(test, unix))]
mod import_tests {
  use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
  };

  use chrono::Utc;

  use crate::{
    Bucket,
    game::{AccessPolicy, GameConfig, HostType},
  };

  fn temp_path(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock before unix epoch")
      .as_nanos();
    std::env::temp_dir().join(format!(
      "ret2shell-bucket-import-{name}-{}-{nanos}",
      std::process::id()
    ))
  }

  fn run_git(repo: &Path, args: &[&str]) {
    let status = Command::new("git")
      .arg("-C")
      .arg(repo)
      .args(args)
      .status()
      .expect("run git command");
    assert!(status.success(), "git command failed: {args:?}");
  }

  #[tokio::test]
  async fn import_adopts_a_non_bare_repository_and_locks_it() {
    let source = temp_path("source");
    let root = temp_path("root");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&root).unwrap();
    let now = Utc::now();
    let config = GameConfig {
      name: "Imported PoC".to_owned(),
      updated_at: now,
      brief: "Imported training".to_owned(),
      start_at: now,
      end_at: now + chrono::Duration::days(1),
      register_at: now,
      archive_at: now + chrono::Duration::days(2),
      host_type: HostType::CTFTraining,
      team_size: 0,
      env_limit: None,
      access_policy: AccessPolicy { sync: 1 },
      cover: None,
      logo: None,
      can_register_after_started: true,
      award_rate: 0,
      weight: 1,
    };
    fs::write(
      source.join("config.toml"),
      toml::to_string_pretty(&config).unwrap(),
    )
    .unwrap();
    run_git(&source, &["init"]);
    run_git(&source, &["add", "--all"]);
    run_git(
      &source,
      &[
        "-c",
        "user.name=Tester",
        "-c",
        "user.email=tester@example.com",
        "commit",
        "-m",
        "fixture",
      ],
    );

    let bucket = Bucket::open(root.clone()).await;
    let imported = bucket
      .import_game(&source.to_string_lossy(), None)
      .await
      .unwrap();
    assert!(imported.git.path().join(".git").exists());
    assert!(imported.git.path().join(".lock").exists());
    assert_eq!(imported.config().await.unwrap().name, "Imported PoC");
    let imported_path = imported.git.path().to_path_buf();
    drop(imported);
    assert!(!imported_path.join(".lock").exists());

    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(root).unwrap();
  }
}

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

/// Validates a bucket id adopted from a remote source instance. The bucket id
/// becomes a local directory name, so it must stay within a conservative
/// character set and length instead of being re-derived from the game config.
pub fn validate_bucket_id(input: &str) -> Result<(), BucketError> {
  let invalid = || BucketError::InvalidBucketId(input.to_owned());
  if input.is_empty() || input.len() > 128 {
    return Err(invalid());
  }
  let mut chars = input.chars();
  let first = chars.next().expect("non-empty input");
  if !first.is_ascii_alphanumeric() {
    return Err(invalid());
  }
  if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
    return Err(invalid());
  }
  Ok(())
}

/// A full Git commit hash (SHA-1 or SHA-256 object id) used as the admission
/// anchor for sync. Branch names and other mutable refs are not accepted.
pub fn validate_commit_hash(input: &str) -> bool {
  (input.len() == 40 || input.len() == 64) && input.chars().all(|c| c.is_ascii_hexdigit())
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

  /// Removes `.lock` files left behind by a killed process. `RepoLock` only
  /// deletes its file from `Drop`, so a SIGKILL or a host crash leaves the
  /// lock behind and every write to that bucket would fail with `LockError`
  /// until someone removes it by hand. `Bucket::open` runs once at startup,
  /// when no in-process writer can exist, so clearing locks there is safe.
  fn clear_stale_locks(&self) -> Result<usize, BucketError> {
    let mut cleared = 0;
    for entry in std::fs::read_dir(&self.path).map_err(BucketError::IoError)? {
      let entry = entry.map_err(BucketError::IoError)?;
      if !entry.file_type().map_err(BucketError::IoError)?.is_dir() {
        continue;
      }
      let lock_path = entry.path().join(".lock");
      if lock_path.exists() {
        match std::fs::remove_file(&lock_path) {
          Ok(()) => {
            cleared += 1;
            warn!(path=?lock_path, "removed a stale bucket lock left by a previous run");
          }
          Err(error) => {
            warn!(path=?lock_path, error=?error, "failed to remove a stale bucket lock");
          }
        }
      }
    }
    Ok(cleared)
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
    if let Err(error) = result.clear_stale_locks() {
      error!(error=?error, "failed to clear stale bucket locks");
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

  /// Imports a game repository from a remote instance. `bucket_id` is the real
  /// bucket id of the source game and becomes the local bucket name verbatim;
  /// `head_ref` is the pinned admission commit and must match the cloned HEAD
  /// exactly, otherwise the clone is discarded.
  pub async fn import_game(
    &self, repository_url: &str, bearer_token: Option<&str>, bucket_id: &str, head_ref: &str,
  ) -> Result<game::GameBucket, BucketError> {
    validate_bucket_id(bucket_id)?;
    if !validate_commit_hash(head_ref) {
      return Err(BucketError::InvalidBucketId(format!(
        "head ref is not a full commit hash: {head_ref}"
      )));
    }
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
    // reading the config validates the cloned repository before adoption; the
    // caller re-reads it after the bucket is adopted and locked
    let cloned_head = match async {
      let game_bucket = game::GameBucket::open(&self.path, &temporary_name, false).await?;
      game_bucket.config().await?;
      game_bucket.git.get_head().await
    }
    .await
    {
      Ok(head) => head,
      Err(error) => {
        remove_dir_all(&temporary_path).await.ok();
        return Err(error);
      }
    };
    if !cloned_head.eq_ignore_ascii_case(head_ref) {
      remove_dir_all(&temporary_path).await.ok();
      return Err(BucketError::HeadRefMismatch {
        expected: head_ref.to_owned(),
        actual: cloned_head,
      });
    }
    let final_path = self.path.join(bucket_id);
    if final_path.exists() {
      remove_dir_all(&temporary_path).await.ok();
      return Err(BucketError::PathConflict(bucket_id.to_owned()));
    }
    if let Err(error) = tokio::fs::rename(&temporary_path, &final_path).await {
      remove_dir_all(&temporary_path).await.ok();
      return Err(error.into());
    }
    match game::GameBucket::open(&self.path, bucket_id, true).await {
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
    traits::BucketError,
    validate_bucket_id, validate_commit_hash,
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

  fn git_output(repo: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
      .arg("-C")
      .arg(repo)
      .args(args)
      .output()
      .expect("run git command");
    assert!(output.status.success(), "git command failed: {args:?}");
    String::from_utf8(output.stdout)
      .expect("utf-8 git output")
      .trim()
      .to_owned()
  }

  fn fixture_config() -> GameConfig {
    let now = Utc::now();
    GameConfig {
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
    }
  }

  fn build_source_repo(source: &Path) {
    fs::create_dir_all(source).unwrap();
    fs::write(
      source.join("config.toml"),
      toml::to_string_pretty(&fixture_config()).unwrap(),
    )
    .unwrap();
    run_git(source, &["init"]);
    run_git(source, &["add", "--all"]);
    run_git(
      source,
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
  }

  #[test]
  fn bucket_id_validation_accepts_source_ids_and_rejects_paths() {
    assert!(validate_bucket_id("imported_poc_19266d80").is_ok());
    assert!(validate_bucket_id("A-b_3").is_ok());
    for rejected in [
      "",
      ".hidden",
      "..",
      "../escape",
      "slash/id",
      "back\\slash",
      "-leading-dash",
      "_leading-underscore",
      &"x".repeat(129),
      "id with space",
    ] {
      assert!(
        validate_bucket_id(rejected).is_err(),
        "accepted invalid bucket id {rejected:?}"
      );
    }
  }

  #[test]
  fn commit_hash_validation_requires_full_hex_object_ids() {
    assert!(validate_commit_hash(
      "0123456789abcdef0123456789abcdef01234567"
    ));
    assert!(validate_commit_hash(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    ));
    for rejected in [
      "",
      "main",
      "refs/heads/main",
      "0123456789abcdef0123456789abcdef0123456", // 39 chars
      "0123456789abcdef0123456789abcdef012345678", // 41 chars
      "z123456789abcdef0123456789abcdef0123456", // non hex
      "0123456789ABCDEF0123456789abcdef0123456z",
    ] {
      assert!(
        !validate_commit_hash(rejected),
        "accepted invalid commit hash {rejected:?}"
      );
    }
  }

  #[tokio::test]
  async fn import_adopts_a_non_bare_repository_and_locks_it() {
    let source = temp_path("source");
    let root = temp_path("root");
    build_source_repo(&source);
    fs::create_dir_all(&root).unwrap();
    let head = git_output(&source, &["rev-parse", "HEAD"]);
    // a name that differs from anything derivable from the source config,
    // proving the source bucket id is adopted verbatim
    let source_bucket_id = "upstream_real_bucket_9f2c";

    let bucket = Bucket::open(root.clone()).await;
    let imported = bucket
      .import_game(&source.to_string_lossy(), None, source_bucket_id, &head)
      .await
      .unwrap();
    assert!(imported.git.path().join(".git").exists());
    assert!(imported.git.path().join(".lock").exists());
    assert_eq!(imported.name, source_bucket_id);
    assert_eq!(imported.git.path().file_name().unwrap(), source_bucket_id);
    assert_eq!(imported.config().await.unwrap().name, "Imported PoC");
    let imported_path = imported.git.path().to_path_buf();
    drop(imported);
    assert!(!imported_path.join(".lock").exists());

    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(root).unwrap();
  }

  #[tokio::test]
  async fn import_rejects_a_head_that_differs_from_the_pinned_admission() {
    let source = temp_path("source");
    let root = temp_path("root");
    build_source_repo(&source);
    fs::create_dir_all(&root).unwrap();
    let head = git_output(&source, &["rev-parse", "HEAD"]);
    let mut wrong_head = head.clone();
    unsafe {
      wrong_head.as_bytes_mut()[0] = if wrong_head.starts_with('0') {
        b'1'
      } else {
        b'0'
      };
    }

    let bucket = Bucket::open(root.clone()).await;
    let error = bucket
      .import_game(
        &source.to_string_lossy(),
        None,
        "upstream_bucket",
        &wrong_head,
      )
      .await
      .unwrap_err();
    assert!(
      matches!(error, BucketError::HeadRefMismatch { ref expected, ref actual } if expected == &wrong_head && actual == &head),
      "unexpected error: {error:?}"
    );
    // the temporary clone is cleaned up
    let leftovers: Vec<_> = fs::read_dir(&root)
      .unwrap()
      .filter_map(|entry| entry.ok())
      .map(|entry| entry.file_name())
      .collect();
    assert!(leftovers.is_empty(), "leftover entries: {leftovers:?}");

    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(root).unwrap();
  }

  #[tokio::test]
  async fn import_rejects_unsafe_bucket_ids_and_non_commit_heads() {
    let source = temp_path("source");
    let root = temp_path("root");
    build_source_repo(&source);
    fs::create_dir_all(&root).unwrap();
    let head = git_output(&source, &["rev-parse", "HEAD"]);

    let bucket = Bucket::open(root.clone()).await;
    for (bucket_id, head_ref) in [("../escape", head.as_str()), ("ok_bucket", "main")] {
      let error = bucket
        .import_game(&source.to_string_lossy(), None, bucket_id, head_ref)
        .await
        .unwrap_err();
      assert!(
        matches!(error, BucketError::InvalidBucketId(_)),
        "unexpected error for ({bucket_id:?}, {head_ref:?}): {error:?}"
      );
    }

    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(root).unwrap();
  }

  #[tokio::test]
  async fn opening_the_bucket_root_clears_locks_left_by_a_crashed_process() {
    let source = temp_path("source");
    let root = temp_path("root");
    build_source_repo(&source);
    fs::create_dir_all(&root).unwrap();
    let head = git_output(&source, &["rev-parse", "HEAD"]);

    let bucket = Bucket::open(root.clone()).await;
    let imported = bucket
      .import_game(&source.to_string_lossy(), None, "crash_lock_bucket", &head)
      .await
      .unwrap();
    let bucket_path = imported.git.path().to_path_buf();
    drop(imported);
    // simulate a SIGKILL: the lock file survives because Drop never ran
    fs::write(bucket_path.join(".lock"), b"").unwrap();
    assert!(bucket_path.join(".lock").exists());

    let _reopened = Bucket::open(root.clone()).await;
    assert!(
      !bucket_path.join(".lock").exists(),
      "a stale lock must be cleared when the bucket root is opened"
    );

    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(root).unwrap();
  }
}

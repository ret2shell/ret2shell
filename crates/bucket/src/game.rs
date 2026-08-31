use std::{
  fs::OpenOptions,
  io::ErrorKind,
  path::{Path, PathBuf},
};

use chrono::{DateTime, Utc, serde::ts_seconds};
use deunicode::deunicode_with_tofu;
use heck::ToSnakeCase;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_repr::{Deserialize_repr, Serialize_repr};
use tokio::fs::{read_to_string, remove_dir_all, write};
use tracing::error;

use crate::{
  challenge,
  git::{CommitLog, Git},
  traits::{BucketError, init_dir},
};

#[derive(Debug)]
pub struct GameBucket {
  pub name: String,
  path: PathBuf,
  pub git: Git,
  lock: Option<RepoLock>,
  cleanup_on_drop: bool,
}

#[derive(Debug)]
pub struct RepoLock {
  path: PathBuf,
}

impl RepoLock {
  pub fn acquire(repo_path: impl AsRef<Path>) -> Result<Self, BucketError> {
    let path = repo_path.as_ref().join(".lock");
    match OpenOptions::new().write(true).create_new(true).open(&path) {
      Ok(_) => Ok(Self { path }),
      Err(err) if err.kind() == ErrorKind::AlreadyExists => Err(BucketError::LockError),
      Err(err) => Err(BucketError::IoError(err)),
    }
  }
}

impl Drop for RepoLock {
  fn drop(&mut self) {
    std::fs::remove_file(&self.path).ok();
  }
}

#[derive(Clone, Debug, Serialize_repr, Deserialize_repr)]
#[repr(i32)]
pub enum HostType {
  CTFTraining = 0,
  CTFGame     = 1,
}

#[derive(Clone, Copy, Debug)]
pub enum GameDocument {
  Readme,
  Training,
  Rules,
}

impl GameDocument {
  pub const fn file_name(self) -> &'static str {
    match self {
      Self::Readme => "README.md",
      Self::Training => "TRAINING.md",
      Self::Rules => "RULES.md",
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AccessPolicy {
  pub sync: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameConfig {
  pub name: String,
  #[serde(with = "ts_seconds")]
  pub updated_at: DateTime<Utc>,
  pub brief: String,
  #[serde(with = "ts_seconds")]
  pub start_at: DateTime<Utc>,
  #[serde(with = "ts_seconds")]
  pub end_at: DateTime<Utc>,
  #[serde(with = "ts_seconds")]
  pub register_at: DateTime<Utc>,
  #[serde(with = "ts_seconds")]
  pub archive_at: DateTime<Utc>,
  pub host_type: HostType,
  pub team_size: i32,
  pub env_limit: Option<i32>,
  pub access_policy: AccessPolicy,
  pub cover: Option<String>,
  pub logo: Option<String>,
  pub can_register_after_started: bool,
  pub award_rate: i32,
  pub weight: i32,
}

impl GameBucket {
  pub async fn open(
    root_path: impl AsRef<Path>, name: impl AsRef<str>, should_lock: bool,
  ) -> Result<Self, BucketError> {
    let game_path = root_path.as_ref().join(name.as_ref());
    let git = Git::try_open(&game_path).await?;
    let lock = should_lock
      .then(|| RepoLock::acquire(&game_path))
      .transpose()?;
    Ok(Self {
      name: name.as_ref().to_owned(),
      path: game_path,
      git,
      lock,
      cleanup_on_drop: should_lock,
    })
  }

  pub async fn new(
    root_path: impl AsRef<Path>, game_bucket_name: impl AsRef<str>, game: GameConfig,
  ) -> Result<Self, BucketError> {
    let game_path = root_path.as_ref().join(game_bucket_name.as_ref());
    let git = Git::new(&game_path).await?;
    init_dir!(game_path, "challenges");
    init_dir!(game_path, "writeups");
    write(
      game_path.join("config.toml"),
      toml::to_string_pretty(&game)?,
    )
    .await?;
    write(game_path.join(".gitignore"), ".lock").await?;
    git
      .take_shot(
        ":tada: game created",
        "platform",
        "platform@private.ret.sh.cn",
      )
      .await?;

    Ok(Self {
      name: game_bucket_name.as_ref().to_owned(),
      path: game_path,
      git,
      lock: None,
      cleanup_on_drop: false,
    })
  }

  pub async fn at(
    &self, challenge: impl AsRef<str>,
  ) -> Result<challenge::ChallengeBucket, BucketError> {
    challenge::ChallengeBucket::open(
      &self.path.join("challenges"),
      challenge,
      self.lock.is_some(),
    )
    .await
  }

  pub async fn commit(
    &self, message: impl AsRef<str>, author: impl AsRef<str>, email: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    if self.lock.is_none() {
      return Err(BucketError::NeedLocking);
    }
    self.git.take_shot(message, author, email).await?;
    Ok(())
  }

  pub async fn cleanup(&self) -> Result<(), BucketError> {
    if self.lock.is_none() {
      return Err(BucketError::NeedLocking);
    }
    self.git.cleanup().await?;
    Ok(())
  }

  pub async fn logs(&self, challenge: impl AsRef<str>) -> Result<Vec<CommitLog>, BucketError> {
    let sub_path = "challenges".to_owned() + "/" + challenge.as_ref();
    // check path traversal
    let full_path = self.path.join(&sub_path);
    if !full_path.exists() {
      return Err(BucketError::PathDoesNotExist(sub_path));
    }
    if !full_path
      .canonicalize()?
      .starts_with(self.path.canonicalize()?)
    {
      return Err(BucketError::PathTraversal);
    }
    self.git.logs(sub_path).await
  }

  pub async fn set_config(&self, game: Value) -> Result<(), BucketError> {
    if self.lock.is_none() {
      return Err(BucketError::NeedLocking);
    }
    let game: GameConfig = serde_json::from_value(game)?;
    write(
      self.path.join("config.toml"),
      toml::to_string_pretty(&game)?,
    )
    .await?;
    Ok(())
  }

  pub async fn read_document(&self, document: GameDocument) -> Result<Option<String>, BucketError> {
    match read_to_string(self.path.join(document.file_name())).await {
      Ok(content) => Ok(Some(content)),
      Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
      Err(err) => Err(err.into()),
    }
  }

  pub async fn write_document(
    &self, document: GameDocument, content: &str,
  ) -> Result<(), BucketError> {
    if self.lock.is_none() {
      return Err(BucketError::NeedLocking);
    }
    write(self.path.join(document.file_name()), content).await?;
    Ok(())
  }

  pub async fn config(&self) -> Result<GameConfig, BucketError> {
    let config_str = read_to_string(self.path.join("config.toml")).await?;
    let config: GameConfig = toml::from_str(&config_str)?;
    Ok(config)
  }

  pub async fn create(&self, challenge: Value) -> Result<challenge::ChallengeBucket, BucketError> {
    if self.lock.is_none() {
      return Err(BucketError::NeedLocking);
    }
    let challenge_config: challenge::ChallengeConfig = serde_json::from_value(challenge)?;
    let challenge_name = deunicode_with_tofu(challenge_config.name.as_ref(), "_")
      .trim()
      .to_owned()
      .to_snake_case();
    let challenge_name = if challenge_name.len() > 72 {
      challenge_name[..72].to_owned()
    } else {
      challenge_name
    };
    let challenge_name = format!("{}_{:x}", challenge_name, Utc::now().timestamp(),);
    if self.path.join("challenges").join(&challenge_name).exists() {
      return Err(BucketError::PathConflict(challenge_name));
    }
    match challenge::ChallengeBucket::new(
      &self.path.join("challenges"),
      &challenge_name,
      challenge_config,
    )
    .await
    {
      Ok(bucket) => Ok(bucket),
      Err(BucketError::PathConflict(_)) => {
        error!(challenge=?challenge_name, "challenge bucket path conflict");
        Err(BucketError::PathConflict(challenge_name))
      }
      Err(e) => {
        error!(error=?e, "failed to create challenge bucket");
        // cleanup the failed created challenge bucket
        // it may not exist so we ignore the error
        remove_dir_all(self.path.join("challenges").join(&challenge_name))
          .await
          .ok();
        Err(e)
      }
    }
  }

  pub async fn delete(&self, challenge: impl AsRef<str>) -> Result<(), BucketError> {
    if self.lock.is_none() {
      return Err(BucketError::NeedLocking);
    }
    let _ = self.at(&challenge).await?;
    remove_dir_all(self.path.join("challenges").join(challenge.as_ref())).await?;
    Ok(())
  }
}

impl Drop for GameBucket {
  fn drop(&mut self) {
    if self.cleanup_on_drop && self.lock.is_some() {
      self.git.cleanup_sync().ok();
    }
  }
}

#[cfg(test)]
pub(crate) mod tests {
  use std::time::{SystemTime, UNIX_EPOCH};

  use chrono::{Duration, Utc};
  use serde_json::json;

  use super::{GameBucket, GameConfig, GameDocument, RepoLock};
  use crate::traits::BucketError;

  /// Child `git` processes spawned by [`crate::git::Git`] inherit these
  /// variables. CI images usually have no global git identity configured,
  /// which makes `git commit` fail inside [`GameBucket::new`]. Every caller
  /// writes the same constant values, so concurrent initialization is
  /// benign.
  pub(crate) fn ensure_git_identity_env() {
    for (key, value) in [
      ("GIT_AUTHOR_NAME", "Tester"),
      ("GIT_AUTHOR_EMAIL", "tester@example.com"),
      ("GIT_COMMITTER_NAME", "Tester"),
      ("GIT_COMMITTER_EMAIL", "tester@example.com"),
    ] {
      if std::env::var_os(key).is_none() {
        // SAFETY: test-only initialization with constant values shared by
        // every caller; readers only ever observe one of the constants.
        unsafe { std::env::set_var(key, value) };
      }
    }
  }

  fn temp_root(label: &str) -> std::path::PathBuf {
    ensure_git_identity_env();
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    std::env::temp_dir().join(format!(
      "r2s-game-bucket-test-{label}-{}-{nanos}",
      std::process::id()
    ))
  }

  fn game_config() -> GameConfig {
    let now = Utc::now();
    GameConfig {
      name: "Sample Game".to_owned(),
      updated_at: now,
      brief: "a sample game".to_owned(),
      start_at: now + Duration::days(1),
      end_at: now + Duration::days(2),
      register_at: now,
      archive_at: now + Duration::days(3),
      host_type: super::HostType::CTFGame,
      team_size: 4,
      env_limit: Some(2),
      access_policy: super::AccessPolicy { sync: 0 },
      cover: None,
      logo: None,
      can_register_after_started: false,
      award_rate: 100,
      weight: 1,
    }
  }

  async fn locked_bucket(label: &str) -> (std::path::PathBuf, GameBucket) {
    let root = temp_root(label);
    let bucket = GameBucket::new(&root, "sample_game", game_config())
      .await
      .unwrap();
    // reopen with the write lock, mirroring admin edit flows.
    drop(bucket);
    let bucket = GameBucket::open(&root, "sample_game", true).await.unwrap();
    (root, bucket)
  }

  #[tokio::test]
  async fn new_creates_layout_with_initial_commit_and_config_round_trips() {
    let root = temp_root("layout");
    let config = game_config();
    let bucket = GameBucket::new(&root, "sample_game", config.clone())
      .await
      .unwrap();

    for entry in ["challenges", "writeups", "config.toml", ".gitignore"] {
      assert!(
        root.join("sample_game").join(entry).exists(),
        "missing {entry}"
      );
    }
    assert_eq!(
      tokio::fs::read_to_string(root.join("sample_game").join(".gitignore"))
        .await
        .unwrap()
        .trim(),
      ".lock"
    );

    // the stored config survives a serialize/deserialize round-trip.
    assert_eq!(bucket.config().await.unwrap().name, "Sample Game");
    assert_eq!(bucket.config().await.unwrap().team_size, 4);

    // creating over an existing bucket path conflicts.
    let err = GameBucket::new(&root, "sample_game", config)
      .await
      .unwrap_err();
    assert!(matches!(err, BucketError::PathConflict(_)));

    // opening a missing bucket reports the missing path.
    let err = GameBucket::open(&root, "no_such_game", false)
      .await
      .unwrap_err();
    assert!(matches!(err, BucketError::PathDoesNotExist(path) if path.ends_with("no_such_game")));

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn unlocked_handles_reject_writes_but_locked_handles_accept_them() {
    let (root, bucket) = locked_bucket("locking").await;
    let challenge_json = json!({
      "name": "Warm Up",
      "tag": [{ "name": "misc", "primary": true }],
      "score_rule": { "initial": 500, "minimum": 50, "decay": 10 },
    });

    let unlocked = GameBucket::open(&root, "sample_game", false).await.unwrap();

    // read-only operations stay available without the lock.
    assert!(unlocked.config().await.is_ok());
    assert!(unlocked.at("warm_up").await.is_err());

    // every mutating entry point refuses to run without the lock.
    assert!(matches!(
      unlocked.commit("msg", "a", "b").await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.cleanup().await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.set_config(json!({})).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.write_document(GameDocument::Readme, "# hi").await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.create(challenge_json.clone()).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.delete("warm_up").await,
      Err(BucketError::NeedLocking)
    ));

    // with the lock held the same operations succeed.
    bucket
      .set_config(serde_json::to_value(game_config()).unwrap())
      .await
      .unwrap();
    bucket
      .write_document(GameDocument::Rules, "be nice")
      .await
      .unwrap();
    bucket
      .commit(":memo: update rules", "tester", "tester@example.com")
      .await
      .unwrap();
    bucket.cleanup().await.unwrap();
    let challenge = bucket.create(challenge_json).await.unwrap();
    bucket.delete(challenge.name.as_str()).await.unwrap();
    assert!(
      !bucket
        .path
        .join("challenges")
        .join(&challenge.name)
        .exists()
    );

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn repo_lock_is_exclusive_and_removed_on_drop() {
    let root = temp_root("repo-lock");
    std::fs::create_dir_all(&root).unwrap();

    let lock_path = root.join(".lock");
    let lock = RepoLock::acquire(&root).unwrap();
    assert!(lock_path.exists());
    assert!(matches!(
      RepoLock::acquire(&root),
      Err(BucketError::LockError)
    ));

    drop(lock);
    assert!(!lock_path.exists());
    RepoLock::acquire(&root).unwrap();

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn documents_default_to_missing_and_round_trip_after_write() {
    let (root, bucket) = locked_bucket("documents").await;

    for document in [
      GameDocument::Readme,
      GameDocument::Training,
      GameDocument::Rules,
    ] {
      assert!(bucket.read_document(document).await.unwrap().is_none());
    }

    bucket
      .write_document(GameDocument::Readme, "# readme")
      .await
      .unwrap();
    bucket
      .write_document(GameDocument::Training, "# training")
      .await
      .unwrap();
    bucket
      .write_document(GameDocument::Rules, "# rules")
      .await
      .unwrap();

    assert_eq!(
      bucket
        .read_document(GameDocument::Readme)
        .await
        .unwrap()
        .as_deref(),
      Some("# readme")
    );
    assert_eq!(
      bucket
        .read_document(GameDocument::Training)
        .await
        .unwrap()
        .as_deref(),
      Some("# training")
    );
    assert_eq!(
      bucket
        .read_document(GameDocument::Rules)
        .await
        .unwrap()
        .as_deref(),
      Some("# rules")
    );

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn create_normalizes_long_challenge_names() {
    let (root, bucket) = locked_bucket("naming").await;

    // spaces and capitals are folded into snake_case with a hex timestamp suffix.
    let named = bucket
      .create(json!({
        "name": "Hello World Challenge",
        "tag": [{ "name": "web", "primary": true }],
        "score_rule": { "initial": 100, "minimum": 10, "decay": 5 },
      }))
      .await
      .unwrap();
    assert!(named.name.starts_with("hello_world_challenge_"));
    i64::from_str_radix(named.name.rsplit('_').next().unwrap(), 16).expect("hex timestamp suffix");

    // names longer than 72 bytes are truncated before the suffix is appended.
    let long = bucket
      .create(json!({
        "name": "a".repeat(80),
        "tag": [{ "name": "pwn", "primary": false }],
        "score_rule": { "initial": 100, "minimum": 10, "decay": 5 },
      }))
      .await
      .unwrap();
    assert!(long.name.starts_with(&"a".repeat(72)));
    assert!(long.name[72..].starts_with('_'));
    i64::from_str_radix(&long.name[73..], 16).expect("hex timestamp suffix");

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn logs_report_missing_paths_and_refuse_traversal_escapes() {
    let (root, bucket) = locked_bucket("logs").await;

    let created = bucket
      .create(json!({
        "name": "Logged Challenge",
        "tag": [{ "name": "rev", "primary": true }],
        "score_rule": { "initial": 200, "minimum": 20, "decay": 8 },
      }))
      .await
      .unwrap();
    bucket
      .commit(":sparkles: add challenge", "tester", "tester@example.com")
      .await
      .unwrap();

    // history is available for existing challenges.
    let logs = bucket.logs(created.name.as_str()).await.unwrap();
    assert!(!logs.is_empty());

    // unknown challenges report the checked sub-path.
    let err = bucket.logs("no_such_challenge").await.unwrap_err();
    let expected = format!("challenges/{}", "no_such_challenge");
    assert!(
      matches!(&err, BucketError::PathDoesNotExist(path) if *path == expected),
      "unexpected error: {err:?}"
    );

    // symlinks pointing outside the bucket are rejected as traversal.
    let outside = temp_root("logs-outside-target");
    std::fs::create_dir_all(&outside).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, bucket.path.join("challenges").join("escape")).unwrap();
    let err = bucket.logs("escape").await.unwrap_err();
    assert!(matches!(err, BucketError::PathTraversal));

    std::fs::remove_dir_all(root).ok();
    std::fs::remove_dir_all(outside).ok();
  }
}

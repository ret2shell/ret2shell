use std::path::{Path, PathBuf};

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
  locked: bool,
}

#[derive(Clone, Debug, Serialize_repr, Deserialize_repr)]
#[repr(i32)]
pub enum HostType {
  CTFTraining = 0,
  CTFGame     = 1,
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
    if should_lock && game_path.join(".lock").exists() {
      return Err(BucketError::LockError);
    }
    let git = Git::try_open(&game_path).await?;
    if should_lock {
      tokio::fs::write(&game_path.join(".lock"), "").await?;
    }
    Ok(Self {
      name: name.as_ref().to_owned(),
      path: game_path,
      git,
      locked: should_lock,
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
      locked: false,
    })
  }

  pub async fn at(
    &self, challenge: impl AsRef<str>,
  ) -> Result<challenge::ChallengeBucket, BucketError> {
    challenge::ChallengeBucket::open(&self.path.join("challenges"), challenge, self.locked).await
  }

  pub async fn commit(
    &self, message: impl AsRef<str>, author: impl AsRef<str>, email: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    self.git.take_shot(message, author, email).await?;
    Ok(())
  }

  pub async fn cleanup(&self) -> Result<(), BucketError> {
    if !self.locked {
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
    if !self.locked {
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

  pub async fn set_introduction(&self, introduction: &str) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    write(self.path.join("README.md"), introduction.to_string()).await?;
    Ok(())
  }

  pub async fn config(&self) -> Result<GameConfig, BucketError> {
    let config_str = read_to_string(self.path.join("config.toml")).await?;
    let config: GameConfig = toml::from_str(&config_str)?;
    Ok(config)
  }

  pub async fn create(&self, challenge: Value) -> Result<challenge::ChallengeBucket, BucketError> {
    if !self.locked {
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
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    let _ = self.at(&challenge).await?;
    remove_dir_all(self.path.join("challenges").join(challenge.as_ref())).await?;
    Ok(())
  }
}

impl Drop for GameBucket {
  fn drop(&mut self) {
    if self.locked {
      std::fs::remove_file(self.path.join(".lock")).ok();
      self.git.cleanup_sync().ok();
    }
  }
}

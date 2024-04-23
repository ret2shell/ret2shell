use std::path::{Path, PathBuf};

use chrono::{serde::ts_seconds, DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_repr::{Deserialize_repr, Serialize_repr};
use tokio::fs::{read_to_string, remove_dir_all, write};
use tracing::error;

use crate::{
    challenge,
    git::Git,
    traits::{init_dir, BucketError},
    util,
};

#[derive(Debug)]
pub struct GameBucket {
    pub name: String,
    path: PathBuf,
    git: Git,
    locked: bool,
}

#[derive(Clone, Debug, Serialize_repr, Deserialize_repr)]
#[repr(i32)]
pub enum HostType {
    CTFTraining = 0,
    CTFGame = 1,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AccessPolicy {
    pub sync: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameConfig {
    pub name: String,
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
        if game_path.join(".lock").exists() {
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
        git.take_shot(":tada: game created", "platform", "platform@woooo.tech")
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
        challenge::ChallengeBucket::open(&self.path.join("challenges"), challenge, self.locked)
            .await
    }

    pub async fn take_shot(
        &self, message: impl AsRef<str>, author: impl AsRef<str>, email: impl AsRef<str>,
    ) -> Result<(), BucketError> {
        self.git.take_shot(message, author, email).await?;
        Ok(())
    }

    pub async fn cleanup(&self) -> Result<(), BucketError> {
        self.git.cleanup().await?;
        Ok(())
    }

    pub async fn set_config(&self, game: GameConfig) -> Result<(), BucketError> {
        write(
            self.path.join("config.toml"),
            toml::to_string_pretty(&game)?,
        )
        .await?;
        Ok(())
    }

    pub async fn config(&self) -> Result<GameConfig, BucketError> {
        let config_str = read_to_string(self.path.join("config.toml")).await?;
        let config: GameConfig = toml::from_str(&config_str)?;
        Ok(config)
    }

    pub async fn create(
        &self, challenge: Value,
    ) -> Result<challenge::ChallengeBucket, BucketError> {
        let challenge_config: challenge::ChallengeConfig = serde_json::from_value(challenge)?;
        let challenge_name = format!(
            "{}_{:x}",
            util::deunicode_str(&challenge_config.name),
            Utc::now().timestamp(),
        );
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
            Err(e) => {
                error!("create challenge bucket error: {:?}", e);
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
        let _ = self.at(&challenge).await?;
        remove_dir_all(self.path.join("challenges").join(challenge.as_ref())).await?;
        Ok(())
    }
}

impl Drop for GameBucket {
    fn drop(&mut self) {
        if self.locked {
            std::fs::remove_file(self.path.join(".lock")).ok();
        }
    }
}

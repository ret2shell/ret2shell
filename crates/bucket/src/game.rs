use std::path::{Path, PathBuf};

use chrono::{
    serde::{ts_seconds, ts_seconds_option},
    DateTime, Utc,
};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use tokio::fs::{create_dir_all, write};

use crate::{git::Git, traits::BucketError};

#[derive(Clone, Debug)]
pub struct GameBucket {
    pub name: String,
    pub path: PathBuf,
    pub git: Git,
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
    pub introduction_id: i64,
    #[serde(with = "ts_seconds")]
    pub start_at: DateTime<Utc>,
    #[serde(with = "ts_seconds")]
    pub end_at: DateTime<Utc>,
    #[serde(with = "ts_seconds_option")]
    pub register_at: Option<DateTime<Utc>>,
    #[serde(with = "ts_seconds_option")]
    pub archive_at: Option<DateTime<Utc>>,
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
        root_path: impl AsRef<Path>, name: impl AsRef<str>,
    ) -> Result<Self, BucketError> {
        let game_path = root_path.as_ref().join(name.as_ref());
        let git = Git::try_open(&game_path).await?;
        Ok(Self {
            name: name.as_ref().to_owned(),
            path: game_path,
            git,
        })
    }

    pub async fn new(
        root_path: impl AsRef<Path>, game_bucket_name: impl AsRef<str>, game: GameConfig,
    ) -> Result<Self, BucketError> {
        let game_path = root_path.as_ref().join(game_bucket_name.as_ref());
        let git = Git::new(&game_path).await?;
        create_dir_all(game_path.join("challenges")).await?;
        write(game_path.join("challenges").join(".gitkeep"), "").await?;
        create_dir_all(game_path.join("writeups")).await?;
        write(game_path.join("writeups").join(".gitkeep"), "").await?;
        write(
            game_path.join("config.toml"),
            toml::to_string_pretty(&game)?,
        )
        .await?;
        write(".gitignore", ".lock").await?;
        git.take_shot(":tada: game created", "platform", "platform@woooo.tech")
            .await?;

        Ok(Self {
            name: game_bucket_name.as_ref().to_owned(),
            path: game_path,
            git,
        })
    }

    pub async fn lock(&self) -> Result<(), BucketError> {
        if self.path.join(".lock").exists() {
            return Err(BucketError::LockError);
        }
        write(self.path.join(".lock"), "").await?;
        Ok(())
    }

    pub async fn unlock(&self) -> Result<(), BucketError> {
        if !self.path.join(".lock").exists() {
            return Err(BucketError::LockError);
        }
        tokio::fs::remove_file(self.path.join(".lock")).await?;
        Ok(())
    }
}

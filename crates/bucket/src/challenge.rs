use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::fs::{create_dir, write};

use crate::traits::{init_dir, BucketError};

#[derive(Debug)]
pub struct ChallengeBucket {
    pub name: String,
    pub path: PathBuf,
    pub locked: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScoreRule {
    pub initial: i32,
    pub minimum: i32,
    pub decay: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tag {
    name: String,
    primary: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TagList(pub Vec<Tag>);

#[derive(Serialize, Deserialize)]
pub struct ChallengeConfig {
    pub name: String,
    pub hidden: bool,
    pub tag: TagList,
    pub score_rule: ScoreRule,
}

impl ChallengeBucket {
    pub async fn open(
        root_path: impl AsRef<Path>, name: impl AsRef<str>, locked: bool,
    ) -> Result<Self, BucketError> {
        let challenge_path = root_path.as_ref().join(name.as_ref());
        if !challenge_path.exists() {
            return Err(BucketError::PathDoesNotExist(
                challenge_path.display().to_string(),
            ));
        }
        Ok(Self {
            name: name.as_ref().to_owned(),
            path: challenge_path,
            locked,
        })
    }

    pub async fn new(
        root_path: impl AsRef<Path>, name: impl AsRef<str>, config: ChallengeConfig,
    ) -> Result<Self, BucketError> {
        let challenge_path = root_path.as_ref().join(name.as_ref());
        if challenge_path.exists() {
            return Err(BucketError::PathConflict(
                challenge_path.display().to_string(),
            ));
        }
        create_dir(&challenge_path).await?;
        init_dir!(challenge_path, "images");
        init_dir!(challenge_path, "mapped");
        init_dir!(challenge_path, "scripts");
        init_dir!(challenge_path, "src");
        init_dir!(challenge_path, "static");
        write(&challenge_path.join("checkers.toml"), "").await?;
        write(
            &challenge_path.join("config.toml"),
            toml::to_string_pretty(&config)?,
        )
        .await?;

        Ok(Self {
            name: name.as_ref().to_owned(),
            path: challenge_path,
            locked: false,
        })
    }
}

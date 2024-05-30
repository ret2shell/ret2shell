use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{
    fs::{create_dir, read_to_string, write},
    io::AsyncRead,
};

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

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub async fn set_config(&self, config: ChallengeConfig) -> Result<(), BucketError> {
        write(
            &self.path.join("config.toml"),
            toml::to_string_pretty(&config)?,
        )
        .await?;
        Ok(())
    }

    pub async fn config(&self) -> Result<ChallengeConfig, BucketError> {
        let config = toml::from_str(&read_to_string(&self.path.join("config.toml")).await?)?;
        Ok(config)
    }

    pub async fn set_checker_config(&self, config: Value) -> Result<(), BucketError> {
        write(
            &self.path.join("checkers.toml"),
            toml::to_string_pretty(&config)?,
        )
        .await?;
        Ok(())
    }

    pub async fn checker_config(&self) -> Result<Value, BucketError> {
        let config = toml::from_str(&read_to_string(&self.path.join("checkers.toml")).await?)?;
        Ok(config)
    }

    async fn upload_file(
        &self, dest: impl AsRef<str>, name: impl AsRef<str>,
        mut stdin: impl AsyncRead + Send + Unpin,
    ) -> Result<(), BucketError> {
        if !matches!(
            dest.as_ref(),
            "images" | "mapped" | "scripts" | "src" | "static"
        ) {
            return Err(BucketError::PathDoesNotExist(dest.as_ref().to_owned()));
        }
        let dest_path = self.path.join(dest.as_ref()).join(name.as_ref());
        let mut file = tokio::fs::File::create(&dest_path).await?;
        tokio::io::copy(&mut stdin, &mut file).await?;

        Ok(())
    }

    pub async fn upload_static(
        &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
    ) -> Result<(), BucketError> {
        self.upload_file("static", name, stdin).await
    }

    pub async fn upload_images(
        &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
    ) -> Result<(), BucketError> {
        self.upload_file("images", name, stdin).await
    }

    pub async fn upload_mapped(
        &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
    ) -> Result<(), BucketError> {
        self.upload_file("mapped", name, stdin).await
    }

    pub async fn upload_scripts(
        &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
    ) -> Result<(), BucketError> {
        self.upload_file("scripts", name, stdin).await
    }

    pub async fn upload_src(
        &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
    ) -> Result<(), BucketError> {
        self.upload_file("src", name, stdin).await
    }

    pub fn hash(&self) -> String {
        let mut hasher = ring::digest::Context::new(&ring::digest::SHA256);
        hasher.update(self.path.to_string_lossy().as_bytes());
        hasher
            .finish()
            .as_ref()
            .iter()
            .fold(String::new(), |mut acc, b| {
                acc.push_str(&format!("{:02x}", b));
                acc
            })
        // .map(|b| format!("{:02x}", b))
        // .collect::<String>()
    }
}

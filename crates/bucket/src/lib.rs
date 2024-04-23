use std::path::PathBuf;

use game::GameConfig;
use r2s_config::bucket;
use serde_json::Value;
use tokio::fs::remove_dir_all;
use tracing::error;
pub use traits::BucketError;

pub mod challenge;
pub mod game;
pub mod git;
pub mod traits;
mod util;

#[derive(Clone, Debug)]
pub struct Bucket {
    path: PathBuf,
}

impl Bucket {
    pub fn open(path: PathBuf) -> Self {
        Self { path }
    }

    pub async fn create(&self, game: Value) -> Result<game::GameBucket, BucketError> {
        let game_config: GameConfig = serde_json::from_value(game)?;
        let game_bucket_name = format!(
            "{}_{:x}",
            util::deunicode_str(&game_config.name),
            game_config.start_at.timestamp()
        );
        match game::GameBucket::new(&self.path, &game_bucket_name, game_config).await {
            Ok(bucket) => Ok(bucket),
            Err(e) => {
                error!("create game bucket error: {:?}", e);
                // cleanup the failed created game bucket
                // it may not exist so we ignore the error
                // remove_dir_all(self.path.join(&game_bucket_name)).await.ok();
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
            return Err(BucketError::PathDoesNotExist(format!("{}", path.display())));
        }
        Ok(Bucket::open(path))
    } else {
        Err(BucketError::ConfigNotFound)
    }
}

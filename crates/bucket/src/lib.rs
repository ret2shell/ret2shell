use std::path::PathBuf;

use game::GameConfig;
use r2s_config::bucket;
use serde_json::Value;
use tokio::fs::remove_dir_all;
use tracing::error;
use traits::BucketError;

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
        if self.path.join(&game_bucket_name).exists() {
            return Err(BucketError::PathConflict(game_bucket_name));
        }
        match game::GameBucket::new(&self.path, &game_bucket_name, game_config).await {
            Ok(bucket) => Ok(bucket),
            Err(e) => {
                error!("create game bucket error: {:?}", e);
                // cleanup the failed created game bucket
                // it may not exist so we ignore the error
                remove_dir_all(self.path.join(&game_bucket_name)).await.ok();
                Err(e)
            }
        }
    }

    pub async fn at(&self, name: impl AsRef<str>) -> Result<game::GameBucket, BucketError> {
        game::GameBucket::open(&self.path, name).await
    }
}

pub async fn initialize(config: &bucket::Config) -> Result<Bucket, BucketError> {
    let path: PathBuf = config.path.clone().into();
    if !path.exists() {
        return Err(BucketError::PathDoesNotExist(format!("{}", path.display())));
    }
    Ok(Bucket::open(path))
}

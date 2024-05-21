use std::path::{Path, PathBuf};

use tokio::fs;

mod traits;
mod utils;

#[derive(Clone, Debug)]
pub struct Media {
    path: PathBuf,
}

impl Media {
    pub async fn try_open(path: impl AsRef<Path>) -> Result<Self, traits::MediaError> {
        let path = path.as_ref().to_path_buf();
        if !path.exists() {
            fs::create_dir_all(&path).await?;
        }
        let temp_path = path.clone().join("tmp");
        if !temp_path.exists() {
            fs::create_dir(&temp_path).await?;
        }
        let thumbnails_path = path.clone().join("thumbnails");
        if !thumbnails_path.exists() {
            fs::create_dir(&thumbnails_path).await?;
        }
        Ok(Media { path })
    }

    #[allow(dead_code)]
    fn temp_dir(&self) -> PathBuf {
        self.path.join("tmp")
    }

    #[allow(dead_code)]
    fn thumbnails_dir(&self) -> PathBuf {
        self.path.join("thumbnails")
    }
}

use std::path::{Path, PathBuf};

use r2s_database::media;
use ring::digest::{Context, SHA256};
use tokio::{
    fs::{self, File},
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
};
pub use traits::MediaError;
use utils::get_media_extension;

mod traits;
mod utils;

#[derive(Clone, Debug)]
pub struct Media {
    path: PathBuf,
}

impl Media {
    pub async fn try_open(path: impl AsRef<Path>) -> Result<Self, MediaError> {
        let path = path.as_ref().to_path_buf();
        if !path.exists() {
            fs::create_dir_all(&path).await?;
        }
        let temp_path = path.clone().join(".temp");
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
        self.path.join(".temp")
    }

    #[allow(dead_code)]
    fn thumbnails_dir(&self) -> PathBuf {
        self.path.join("thumbnails")
    }

    pub async fn save(
        &self, mut stdin: impl AsyncRead + Send + Unpin,
    ) -> Result<media::Model, MediaError> {
        let temp_id = nanoid::nanoid!();
        let temp_path = self.temp_dir().join(temp_id);
        let mut file = fs::File::create(&temp_path).await?;
        let mut hasher = Context::new(&SHA256);
        let mut buf = [0; 8192];
        loop {
            let n = stdin.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            file.write_all(&buf[..n]).await?;
        }
        let hash = hex::encode(hasher.finish().as_ref());
        fs::create_dir_all(self.path.join(&hash[..2]).join(&hash[2..4])).await?;
        let dest = self.path.join(&hash[..2]).join(&hash[2..4]).join(&hash);
        fs::rename(&temp_path, &dest).await?;
        Ok(media::Model {
            id: 0,
            hash,
            uploader_id: 0,
        })
    }

    pub async fn make_thumbnail(
        &self, hash: impl AsRef<str>, longest_edge: u32,
    ) -> Result<(), MediaError> {
        let hash = hash.as_ref();
        let original = self.path.join(&hash[..2]).join(&hash[2..4]).join(&hash);
        let dest = self
            .thumbnails_dir()
            .join(&hash[..2])
            .join(&hash[2..4])
            .join(&hash);
        utils::make_thumbnail(&original, &dest, longest_edge).await
    }

    pub async fn get(&self, hash: impl AsRef<str>) -> Result<File, MediaError> {
        let hash = hash.as_ref();
        let path = self.path.join(&hash[..2]).join(&hash[2..4]).join(&hash);
        Ok(File::open(&path).await?)
    }

    pub async fn delete(&self, hash: impl AsRef<str>) -> Result<(), MediaError> {
        let hash = hash.as_ref();
        let path = self.path.join(&hash[..2]).join(&hash[2..4]).join(&hash);
        fs::remove_file(&path).await?;
        let thumbnails_path = self
            .thumbnails_dir()
            .join(&hash[..2])
            .join(&hash[2..4])
            .join(&hash);
        if thumbnails_path.exists() {
            fs::remove_file(&thumbnails_path).await?;
        }
        Ok(())
    }

    pub async fn get_mimetype(&self, hash: impl AsRef<str>) -> Result<String, MediaError> {
        let hash = hash.as_ref();
        let path = self.path.join(&hash[..2]).join(&hash[2..4]).join(&hash);
        let mime_type = mime_guess::from_path(&path)
            .first_or_octet_stream()
            .to_string();
        Ok(mime_type)
    }

    pub async fn accepted(content_type: impl AsRef<str>) -> Result<bool, MediaError> {
        get_media_extension(content_type.as_ref())?;
        Ok(true)
    }
}

pub async fn initialize(config: &Option<r2s_config::media::Config>) -> Result<Media, MediaError> {
    match config {
        Some(config) => Media::try_open(&config.path).await,
        None => Err(MediaError::MediaStoragePathNotConfigured),
    }
}

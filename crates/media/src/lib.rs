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

macro_rules! hashed_path {
  ($base: expr, $hash: expr) => {
    $base.join(&$hash[..2]).join(&$hash[2..4]).join($hash)
  };
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
    file.flush().await?;
    drop(file);

    if !self.is_image(utils::get_media_type(&temp_path)?) {
      fs::remove_file(&temp_path).await?;
      return Err(MediaError::UnsupportedFileType("not an image".to_string()));
    }

    fs::create_dir_all(self.path.join(&hash[..2]).join(&hash[2..4])).await?;
    let dest = hashed_path!(self.path, &hash);
    match fs::rename(&temp_path, &dest).await {
      Ok(()) => {}
      Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
        let _ = fs::remove_file(&temp_path).await;
      }
      Err(err) => {
        let _ = fs::remove_file(&temp_path).await;
        return Err(err.into());
      }
    }
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
    let original = hashed_path!(self.path, &hash);
    let dest = self
      .thumbnails_dir()
      .join(&hash[..2])
      .join(&hash[2..4])
      .join(hash);
    utils::make_thumbnail(&original, &dest, longest_edge).await
  }

  pub async fn get(&self, hash: impl AsRef<str>) -> Result<File, MediaError> {
    let hash = hash.as_ref();
    let path = hashed_path!(self.path, &hash);
    Ok(File::open(&path).await?)
  }

  pub async fn delete(&self, hash: impl AsRef<str>) -> Result<(), MediaError> {
    let hash = hash.as_ref();
    let path = hashed_path!(self.path, &hash);
    fs::remove_file(&path).await?;
    let thumbnails_path = self
      .thumbnails_dir()
      .join(&hash[..2])
      .join(&hash[2..4])
      .join(hash);
    if thumbnails_path.exists() {
      fs::remove_file(&thumbnails_path).await?;
    }
    Ok(())
  }

  pub fn get_mime_type(&self, hash: impl AsRef<str>) -> Result<String, MediaError> {
    let hash = hash.as_ref();
    let path = hashed_path!(self.path, &hash);
    let mime_type = utils::get_media_type(&path)?;
    Ok(mime_type)
  }

  pub fn is_image(&self, content_type: impl AsRef<str>) -> bool {
    get_media_extension(content_type.as_ref()).is_ok()
  }
}

pub async fn initialize(config: &Option<r2s_config::media::Config>) -> Result<Media, MediaError> {
  match config {
    Some(config) => Media::try_open(&config.path).await,
    None => Err(MediaError::MediaStoragePathNotConfigured),
  }
}

#[cfg(test)]
mod tests {
  use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
  };

  use ring::digest::{SHA256, digest};

  use super::{Media, MediaError};

  const PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0,
    0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0,
    239, 191, 167, 219, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ];

  fn temp_path(name: &str) -> PathBuf {
    let unique = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    std::env::temp_dir().join(format!(
      "ret2shell-media-{name}-{}-{unique}",
      std::process::id()
    ))
  }

  fn sha256(bytes: &[u8]) -> String {
    hex::encode(digest(&SHA256, bytes).as_ref())
  }

  #[tokio::test]
  async fn save_accepts_images_and_reuses_existing_hash() {
    let path = temp_path("image");
    let media = Media::try_open(&path).await.unwrap();

    let first = media.save(PNG).await.unwrap();
    let second = media.save(PNG).await.unwrap();

    assert_eq!(first.hash, sha256(PNG));
    assert_eq!(second.hash, first.hash);
    assert!(hashed_path!(path, first.hash).exists());

    fs::remove_dir_all(path).ok();
  }

  #[tokio::test]
  async fn save_rejects_non_images_without_storing_hashed_file() {
    let path = temp_path("text");
    let media = Media::try_open(&path).await.unwrap();
    let text = b"r2s cli smoke\n";
    let hash = sha256(text);

    let err = media.save(&text[..]).await.unwrap_err();

    assert!(matches!(err, MediaError::UnsupportedFileType(_)));
    assert!(!hashed_path!(path, hash).exists());

    fs::remove_dir_all(path).ok();
  }
}

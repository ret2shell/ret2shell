use std::path::Path;

use image::imageops::FilterType;
use tracing::{debug, info, warn};

use crate::traits::MediaError;

pub fn get_media_type(path: impl AsRef<Path>) -> Result<String, MediaError> {
  let path = path.as_ref();
  match infer::get_from_path(path) {
    Ok(Some(mime)) => {
      if mime.mime_type() == "text/xml" {
        Ok("image/svg+xml".to_string())
      } else {
        Ok(mime.mime_type().into())
      }
    }
    Ok(None) => Err(MediaError::UnsupportedFileType("unknown".to_string())),
    Err(err) => Err(MediaError::InferError(err.to_string())),
  }
}

pub fn get_media_extension(content_type: &str) -> Result<String, MediaError> {
  let mime_type = content_type
    .parse::<mime::Mime>()
    .map_err(MediaError::ParseContentTypeError)?;
  if mime_type.type_() != mime::IMAGE {
    Err(MediaError::UnsupportedFileType(mime_type.to_string()))
  } else {
    Ok(mime_type.subtype().to_string())
  }
}

pub async fn make_thumbnail<PA, PB>(
  original: PA, dest: PB, longest_edge: u32,
) -> Result<(), MediaError>
where
  PA: AsRef<Path>,
  PB: AsRef<Path>, {
  // prevent generate thumbnail repeatedly
  if tokio::fs::metadata(&dest).await.is_ok() {
    return Ok(());
  }
  // prevent generate thumbnail for svg
  if get_media_extension(&get_media_type(&original)?)? == "svg" {
    let _ = tokio::fs::hard_link(original, dest).await;
    return Ok(());
  }
  debug!(src=?original.as_ref(), "generating thumbnail");
  let img = image::open(&original)?;

  match img
    .resize(longest_edge, longest_edge, FilterType::Nearest)
    .save(&dest)
  {
    Err(err) => {
      warn!(error=?err, "failed to resize image to thumbnail");
      info!(dst=?dest.as_ref(), src=?original.as_ref(), "image will be hard linked directly as thumbnail");
      match tokio::fs::hard_link(&original, &dest).await {
        Ok(_) => Ok(()),
        Err(err) => {
          warn!(error=?err, "failed to hard link image to thumbnail");
          info!(dst=?dest.as_ref(), "image will be directly saved");
          tokio::fs::copy(&original, &dest).await?;
          Ok(())
        }
      }
    }
    Ok(_) => Ok(()),
  }
}

#[cfg(test)]
mod tests {
  #[test]
  fn test_media_extension() {
    let content_type = "image/png";
    let extension = super::get_media_extension(content_type).unwrap();
    assert_eq!(extension, "png");
    let content_type = "image/jpeg";
    let extension = super::get_media_extension(content_type).unwrap();
    assert_eq!(extension, "jpeg");
    let content_type = "image/svg+xml";
    let extension = super::get_media_extension(content_type).unwrap();
    assert_eq!(extension, "svg");
  }
}

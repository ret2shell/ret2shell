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
  use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
  };

  use image::{Rgba, RgbaImage};

  use super::{get_media_extension, get_media_type, make_thumbnail};
  use crate::traits::MediaError;

  fn temp_path(name: &str, extension: &str) -> PathBuf {
    let unique = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    std::env::temp_dir().join(format!(
      "ret2shell-{name}-{}-{unique}.{extension}",
      std::process::id()
    ))
  }

  #[test]
  fn media_extension_parses_supported_image_types() {
    assert_eq!(get_media_extension("image/png").unwrap(), "png");
    assert_eq!(get_media_extension("image/jpeg").unwrap(), "jpeg");
    assert_eq!(
      get_media_extension("image/svg+xml; charset=utf-8").unwrap(),
      "svg"
    );
    assert!(matches!(
      get_media_extension("text/plain"),
      Err(MediaError::UnsupportedFileType(content_type)) if content_type == "text/plain"
    ));
  }

  #[test]
  fn media_type_detects_svg_and_rejects_unknown_files() {
    let svg_path = temp_path("vector", "svg");
    let unknown_path = temp_path("unknown", "bin");

    fs::write(
      &svg_path,
      br#"<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>"#,
    )
    .unwrap();
    fs::write(&unknown_path, []).unwrap();

    assert_eq!(get_media_type(&svg_path).unwrap(), "image/svg+xml");
    assert!(matches!(
      get_media_type(&unknown_path),
      Err(MediaError::UnsupportedFileType(file_type)) if file_type == "unknown"
    ));

    fs::remove_file(svg_path).ok();
    fs::remove_file(unknown_path).ok();
  }

  #[tokio::test]
  async fn make_thumbnail_resizes_raster_images() {
    let original = temp_path("image", "png");
    let dest = temp_path("thumb", "png");

    RgbaImage::from_pixel(8, 4, Rgba([255, 0, 0, 255]))
      .save(&original)
      .unwrap();

    make_thumbnail(&original, &dest, 4).await.unwrap();

    let thumbnail = image::open(&dest).unwrap();
    assert!(thumbnail.width() <= 4);
    assert!(thumbnail.height() <= 4);

    fs::remove_file(original).ok();
    fs::remove_file(dest).ok();
  }

  #[tokio::test]
  async fn make_thumbnail_preserves_svg_content() {
    let original = temp_path("vector", "svg");
    let dest = temp_path("vector-thumb", "svg");
    let content =
      br#"<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>"#;

    fs::write(&original, content).unwrap();

    make_thumbnail(&original, &dest, 4).await.unwrap();

    assert_eq!(fs::read(&dest).unwrap(), content);

    fs::remove_file(original).ok();
    fs::remove_file(dest).ok();
  }
}

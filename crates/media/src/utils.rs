use std::path::Path;

use image::imageops::FilterType;
use tracing::{debug, info, warn};

use crate::traits::MediaError;

#[allow(dead_code)]
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

#[allow(dead_code)]
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
    if original.as_ref().extension().unwrap_or_default() == "svg" {
        let _ = tokio::fs::hard_link(original, dest).await;
        return Ok(());
    }
    debug!("generating thumbnail for {}", original.as_ref().display());
    let img = image::open(&original)?;

    match img
        .resize(longest_edge, longest_edge, FilterType::Nearest)
        .save(&dest)
    {
        Err(err) => {
            warn!("resize image to thumbnail error: {err}");
            info!("image will be linked to {}", dest.as_ref().display());
            match tokio::fs::hard_link(&original, &dest).await {
                Ok(_) => Ok(()),
                Err(err) => {
                    warn!("hard link image to thumbnail error: {err}");
                    info!("image will be directly save to {}", dest.as_ref().display());
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

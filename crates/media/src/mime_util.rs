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

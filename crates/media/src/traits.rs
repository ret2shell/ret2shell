use thiserror::Error;

#[derive(Debug, Error)]
pub enum MediaError {
    #[error("failed to parse content type")]
    ParseContentTypeError(#[from] mime::FromStrError),
    #[error("IO error: {0}")]
    IOError(#[from] std::io::Error),
    #[error("image error: {0}")]
    ImageError(#[from] image::ImageError),
    #[error("unsupported file type: {0}")]
    UnsupportedFileType(String),
}

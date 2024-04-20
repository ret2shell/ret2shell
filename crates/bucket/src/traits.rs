use thiserror::Error;

#[derive(Error, Debug)]
pub enum BucketError {
    #[error("bucket path does not exist: {0}")]
    PathDoesNotExist(String),
    #[error("bucket conflict with existing path: {0}")]
    PathConflict(String),
    #[error("could not lock the bucket")]
    LockError,
    #[error("git error: {0}")]
    GitError(#[from] crate::git::GitError),
    #[error("io error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("serde error: {0}")]
    SerdeError(#[from] serde_json::Error),
    #[error("toml serialize error: {0}")]
    TomlError(#[from] toml::ser::Error),
    #[error("toml deserialize error: {0}")]
    TomlDeError(#[from] toml::de::Error),
}

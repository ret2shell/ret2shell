use fred::prelude::*;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CacheError {
    #[error("redis error: {0}")]
    Redis(#[from] RedisError),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("domain needed for key: {0}")]
    DomainNeeded(String),
    #[error("other error: {0}")]
    Other(String),
}

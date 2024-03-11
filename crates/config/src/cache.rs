//! Cache server configuration.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

/// Represents the configuration for a cache.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// The url of the cache server.
    pub url: String,
}

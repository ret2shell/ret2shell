//! Cache server configuration.
use serde::{Deserialize, Serialize};

/// Represents the configuration for a cache.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    /// The url of the cache server.
    pub url: String,
}

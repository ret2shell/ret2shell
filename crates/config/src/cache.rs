//! Cache server configuration.
use serde::{Deserialize, Serialize};

/// Represents the configuration for a cache.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    /// The url of the cache server.
    pub nodes: Vec<String>,
    pub max_connections: Option<u16>,
}

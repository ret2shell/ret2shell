//! Cache server configuration.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// Represents the configuration for a cache.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// The url of the cache server.
    pub url: String,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers return other if it is Some
        other.or_else(|| self)
    }
}

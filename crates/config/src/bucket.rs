//! Bucket configuration.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// Represents the configuration for a bucket.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// The path to the bucket.
    pub path: String,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers return other if it is Some
        other.or(self)
    }
}

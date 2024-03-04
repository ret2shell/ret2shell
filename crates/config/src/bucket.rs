//! Bucket configuration.
use serde::{Deserialize, Serialize};

/// Represents the configuration for a bucket.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketConfig {
    /// The path to the bucket.
    pub path: String,
}

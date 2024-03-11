use sea_orm::FromJsonQueryResult;
/// Configuration for media settings.
use serde::{Deserialize, Serialize};

/// `MediaConfig` is a configuration struct for managing media settings.
#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// `path` is the directory where media files are stored.
    pub path: String,
}

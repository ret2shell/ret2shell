//! The configuration for logging in the application.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// `LoggingConfig` represents the configuration for logging in the application.
#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// `directory` is the path to the directory where log files will be stored.
    pub directory: String,
    /// `level` is the minimum log level that will be recorded (e.g., "info",
    /// "debug", "error").
    pub level: String,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers return other if it is Some
        other.or_else(|| self)
    }
}

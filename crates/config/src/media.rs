use sea_orm::FromJsonQueryResult;
/// Configuration for media settings.
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// `MediaConfig` is a configuration struct for managing media settings.
#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// `path` is the directory where media files are stored.
    pub path: String,
    /// `anti_theft` is a boolean value that determines whether to enable
    /// anti-theft protection.
    pub anti_theft: bool,
    /// `limit` is the maximum number of media files that one user could be
    /// uploaded in a week, administrator is not limited.
    pub limit: i32,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers return other if it is Some
        other.or(self)
    }
}

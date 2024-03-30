//! Automate configuration.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// Indicates whether the Pusher service is enabled or not.
    pub enabled: bool,
    /// The authentication token for the Pusher service.
    pub token: String,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers return other if it is Some
        other.or_else(|| self)
    }
}

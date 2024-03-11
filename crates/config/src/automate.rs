//! Automate configuration.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// Indicates whether the Pusher service is enabled or not.
    pub enabled: bool,
    /// The authentication token for the Pusher service.
    pub token: String,
}

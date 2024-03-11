//! Audit configuration.

use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

/// Represents the configuration for auditing in the application.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// path to sensitive word list
    pub sensitive_word_list: Option<String>,
}

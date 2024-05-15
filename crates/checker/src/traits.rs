use std::{collections::HashMap, path::Path};

use async_trait::async_trait;
use r2s_database::{submission, team, user};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CheckerError {}

#[async_trait]
pub trait ExecutorImpl {
    async fn check(
        &self, bucket: impl AsRef<Path>, submission: submission::Model,
    ) -> Result<bool, CheckerError>;
    async fn flags(
        &self, bucket: impl AsRef<Path>, user: user::Model, team: Option<team::Model>,
    ) -> Result<Vec<String>, CheckerError>;
    async fn env_vars(
        &self, bucket: impl AsRef<Path>, user: user::Model, team: Option<team::Model>,
    ) -> Result<HashMap<String, String>, CheckerError>;
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CheckerExecutor {
    Rusx,
    Python,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CheckerConfig {
    pub executor: String,
    pub entry: String,
    pub queued: bool,
}

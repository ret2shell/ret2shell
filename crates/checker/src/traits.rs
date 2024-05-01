use std::collections::HashMap;

use r2s_database::{challenge, submission, user};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CheckerError {}

pub trait CheckerImpl {
    async fn check(
        &self, user: &user::Model, challenge: &challenge::Model, submission: &submission::Model,
    ) -> Result<bool, CheckerError>;
    async fn flag(
        &self, user: &user::Model, challenge: &challenge::Model,
    ) -> Result<String, CheckerError>;
    async fn env(
        &self, user: &user::Model, challenge: &challenge::Model,
    ) -> Result<HashMap<String, String>, CheckerError>;
}

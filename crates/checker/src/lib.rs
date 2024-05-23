use std::collections::HashMap;

use r2s_bucket::challenge::ChallengeBucket;
use r2s_database::{submission, team, user};
use traits::CheckerError;

pub mod executor;
pub mod traits;

#[derive(Clone, Debug)]
pub struct Checker {}

impl Checker {
    pub async fn check(
        &self, bucket: ChallengeBucket, user: user::Model, team: Option<team::Model>,
        submission: submission::Model,
    ) -> Result<bool, CheckerError> {
        unimplemented!()
    }

    pub async fn environ(
        &self, bucket: ChallengeBucket, user: user::Model, team: Option<team::Model>,
    ) -> Result<HashMap<String, String>, CheckerError> {
        unimplemented!()
    }
}

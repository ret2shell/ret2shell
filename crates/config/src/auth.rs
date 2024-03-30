use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

use crate::traits::Merge;

#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    pub signing_key: String,
    pub buffer_time: i64,
    pub expires_time: i64,
    pub oauth_keys: Option<Json>,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers fields in `other`
        match (self, other) {
            (Some(a), Some(b)) => Some(Config {
                signing_key: b.signing_key,
                buffer_time: b.buffer_time,
                expires_time: b.expires_time,
                oauth_keys: b.oauth_keys.or_else(|| a.oauth_keys),
            }),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        }
    }
}

use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    pub signing_key: String,
    pub buffer_time: i64,
    pub expires_time: i64,
    pub oauth_keys: Option<Json>,
}

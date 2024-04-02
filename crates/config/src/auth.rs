use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct OAuthKey {
    pub service: String,
    pub client_key: Option<String>,
    pub secret: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    pub signing_key: String,
    pub buffer_time: i64,
    pub expires_time: i64,
    pub oauth_keys: Option<Vec<OAuthKey>>,
}

impl Config {
    pub fn desensitize(self) -> Self {
        Config {
            signing_key: "".to_owned(),
            oauth_keys: self.oauth_keys.map(|keys| {
                keys.into_iter()
                    .map(|key| OAuthKey {
                        secret: None,
                        ..key
                    })
                    .collect()
            }),
            ..self
        }
    }
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

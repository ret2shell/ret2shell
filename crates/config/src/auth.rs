use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OAuthKey {
  pub id: String,
  pub key: String,
}

impl OAuthKey {
  pub fn desensitize(self) -> Self {
    OAuthKey {
      key: "".to_owned(),
      ..self
    }
  }
}

#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  pub signing_key: String,
  pub buffer_time: i64,
  pub expires_time: i64,
  pub registrar_script: Option<String>,
}

impl Config {
  pub fn desensitize(self) -> Self {
    Config {
      signing_key: "".to_owned(),
      ..self
    }
  }
}

impl Merge for Option<Config> {
  fn merge(self, other: Self) -> Self {
    // prefers fields in `other`
    match (self, other) {
      (Some(a), Some(b)) => Some(Config {
        signing_key: a.signing_key,
        buffer_time: a.buffer_time,
        expires_time: a.expires_time,
        registrar_script: b.registrar_script.or(a.registrar_script),
      }),
      (Some(a), _) => Some(a),
      (None, Some(b)) => Some(b),
      (None, None) => None,
    }
  }
}

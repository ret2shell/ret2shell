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
      (Some(a), _) => Some(a),
      (None, Some(b)) => Some(b),
      (None, None) => None,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::Config;
  use crate::traits::Merge;

  fn config(signing_key: &str) -> Option<Config> {
    Some(Config {
      signing_key: signing_key.to_owned(),
      buffer_time: 3600,
      expires_time: 86400,
    })
  }

  #[test]
  fn desensitize_clears_signing_key_but_keeps_timings() {
    let desensitized = config("secret-key").unwrap().desensitize();
    assert_eq!(desensitized.signing_key, "");
    assert_eq!(desensitized.buffer_time, 3600);
    assert_eq!(desensitized.expires_time, 86400);
  }

  #[test]
  fn merge_prefers_static_config_and_falls_back_to_database_config() {
    assert_eq!(config("static").merge(config("database")), config("static"));
    assert_eq!(config("static").merge(None), config("static"));
    assert_eq!(None.merge(config("database")), config("database"));
    let none: Option<Config> = None;
    assert_eq!(none.merge(None), None);
  }
}

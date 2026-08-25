//! Audit configuration.

use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// Represents the configuration for auditing in the application.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  /// path to sensitive word list
  pub sensitive_word_list: Option<String>,
}

impl Merge for Option<Config> {
  fn merge(self, other: Self) -> Self {
    // prefers fields in `other`
    match (self, other) {
      (Some(a), Some(_)) => Some(Config {
        sensitive_word_list: a.sensitive_word_list,
      }),
      (Some(a), None) => Some(a),
      (None, Some(b)) => Some(b),
      (None, None) => None,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::Config;
  use crate::traits::Merge;

  fn config(word_list: &str) -> Option<Config> {
    Some(Config {
      sensitive_word_list: Some(word_list.to_owned()),
    })
  }

  #[test]
  fn merge_keeps_base_config_when_both_sides_present() {
    let merged = config("base.txt").merge(config("override.txt"));
    assert_eq!(
      merged.as_ref().unwrap().sensitive_word_list.as_deref(),
      Some("base.txt")
    );
  }

  #[test]
  fn merge_falls_back_to_the_other_side_when_one_side_is_missing() {
    assert_eq!(config("db.txt").merge(None), config("db.txt"));
    assert_eq!(None.merge(config("static.txt")), config("static.txt"));
    let none: Option<Config> = None;
    assert_eq!(none.merge(None), None);
  }
}

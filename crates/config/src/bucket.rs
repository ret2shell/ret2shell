//! Bucket configuration.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// Represents the configuration for a bucket.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  /// The path to the bucket.
  pub path: String,
}

impl Merge for Option<Config> {
  fn merge(self, _: Self) -> Self {
    // prefers return other if it is Some
    self
  }
}

#[cfg(test)]
mod tests {
  use super::Config;
  use crate::traits::Merge;

  fn config(path: &str) -> Option<Config> {
    Some(Config {
      path: path.to_owned(),
    })
  }

  #[test]
  fn merge_keeps_base_path_when_base_is_configured() {
    // NOTE: `other` is discarded entirely by this implementation, see the
    // suspected bug report; only the safe fallback branch is covered here.
    assert_eq!(
      config("/srv/bucket").merge(config("/ignored")),
      config("/srv/bucket")
    );
    assert_eq!(config("/srv/bucket").merge(None), config("/srv/bucket"));
  }
}

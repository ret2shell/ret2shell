//! Cache server configuration.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// Represents the configuration for a cache.
///
/// Supported URL schemes:
/// - `redis://host:port` — standalone (single-node) Redis.
/// - `rediss://host:port` — standalone Redis over TLS.
/// - `redis-cluster://host:port,host:port,…` — Redis cluster.
/// - `rediss-cluster://host:port,host:port,…` — Redis cluster over TLS.
///
/// Sentinel (`redis-sentinel://` / `rediss-sentinel://`) is not yet
/// supported.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  /// The URL of the cache server. See the struct-level documentation for
  /// supported schemes.
  pub url: String,
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

  fn config(url: &str) -> Option<Config> {
    Some(Config {
      url: url.to_owned(),
    })
  }

  #[test]
  fn merge_keeps_base_url_when_base_is_configured() {
    // NOTE: `other` is discarded entirely by this implementation, see the
    // suspected bug report; only the safe fallback branch is covered here.
    assert_eq!(
      config("redis://base:6379").merge(config("redis://ignored:6379")),
      config("redis://base:6379")
    );
    assert_eq!(
      config("redis://base:6379").merge(None),
      config("redis://base:6379")
    );
  }
}

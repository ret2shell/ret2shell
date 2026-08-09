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

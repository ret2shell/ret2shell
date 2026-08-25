//! NATS message queue configuration
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// Represents the configuration for a NATS message queue.
#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  /// The hostname or IP address of the NATS server.
  pub host: String,
  /// The port number on which the NATS server is listening, default to 4222.
  pub port: Option<u16>,
  /// The optional token for authentication with the NATS server.
  pub token: Option<String>,
  /// The optional username and password for authentication with the NATS
  /// server.
  pub user: Option<String>,
  /// The optional password for authentication with the NATS server.
  /// works only when `user` is configured.
  pub password: Option<String>,
  /// The ping interval in seconds.
  pub ping_interval: Option<u64>,
  /// Indicates whether to use TLS for secure communication with the NATS
  /// server.
  pub tls: Option<bool>,
}

impl Config {
  pub fn addr(&self) -> String {
    format!("{}:{}", self.host, self.port.unwrap_or(4222))
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

  fn config(host: &str, port: Option<u16>) -> Option<Config> {
    Some(Config {
      host: host.to_owned(),
      port,
      token: None,
      user: None,
      password: None,
      ping_interval: None,
      tls: None,
    })
  }

  #[test]
  fn addr_defaults_to_nats_port_when_unset() {
    assert_eq!(
      config("nats.internal", None).unwrap().addr(),
      "nats.internal:4222"
    );
    assert_eq!(
      config("nats.internal", Some(4223)).unwrap().addr(),
      "nats.internal:4223"
    );
  }

  #[test]
  fn merge_prefers_static_config_and_falls_back_to_database_config() {
    assert_eq!(
      config("static", None).merge(config("database", None)),
      config("static", None)
    );
    assert_eq!(config("static", None).merge(None), config("static", None));
    assert_eq!(
      None.merge(config("database", None)),
      config("database", None)
    );
    let none: Option<Config> = None;
    assert_eq!(none.merge(None), None);
  }
}

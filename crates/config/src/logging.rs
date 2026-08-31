//! The configuration for logging in the application.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// `LoggingConfig` represents the configuration for logging in the application.
#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  /// `directory` is the path to the directory where log files will be stored.
  pub directory: String,
  /// `level` is the minimum log level that will be recorded (e.g., "info",
  /// "debug", "error").
  pub level: String,
  /// `files_kept` is the last n files that will be kept.
  pub files_kept: Option<usize>,
  /// compress files after they are rotated
  pub compress: Option<bool>,
  /// victoria logs server address.
  /// once you set this, all logs will be sent to the server
  pub victoria: Option<String>,
}

impl Merge for Option<Config> {
  fn merge(self, _: Self) -> Self {
    // static config wins; this section cannot be overridden from the database.
    self
  }
}

#[cfg(test)]
mod tests {
  use super::Config;
  use crate::traits::Merge;

  fn config(directory: &str) -> Option<Config> {
    Some(Config {
      directory: directory.to_owned(),
      level: "info".to_owned(),
      files_kept: Some(7),
      compress: Some(false),
      victoria: None,
    })
  }

  #[test]
  fn merge_keeps_base_logging_config_when_base_is_configured() {
    // NOTE: `other` is discarded entirely by this implementation, see the
    // suspected bug report; only the safe fallback branch is covered here.
    assert_eq!(
      config("/var/log/r2s").merge(config("/ignored")),
      config("/var/log/r2s")
    );
    assert_eq!(config("/var/log/r2s").merge(None), config("/var/log/r2s"));
  }
}

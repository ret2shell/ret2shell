//! Contains the configuration for a database connection.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// Represents the configuration for a database connection.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  /// The name of the database.
  pub db: String,
  /// The hostname of the database server.
  pub host: String,
  /// The port number on which the database server is listening.
  pub port: u16,
  /// The username for the database connection.
  pub user: String,
  /// The password for the database user.
  pub password: String,
  /// The SSL mode to use for the connection.
  pub ssl_mode: String,
}

impl Config {
  /// Constructs a Data Source Name (DSN) string from the current
  /// configuration.
  pub fn dsn(&self) -> String {
    format!(
      "postgresql://{}:{}@{}:{}/{}?sslmode={}",
      self.user, self.password, self.host, self.port, self.db, self.ssl_mode
    )
  }
}

impl Merge for Option<Config> {
  fn merge(self, other: Self) -> Self {
    // prefers return other if it is Some
    other.or(self)
  }
}

#[cfg(test)]
mod tests {
  use super::Config;
  use crate::traits::Merge;

  fn config(host: &str) -> Option<Config> {
    Some(Config {
      db: "ret2shell".to_owned(),
      host: host.to_owned(),
      port: 5432,
      user: "postgres".to_owned(),
      password: "secret".to_owned(),
      ssl_mode: "prefer".to_owned(),
    })
  }

  #[test]
  fn dsn_builds_postgresql_connection_string() {
    let dsn = config("db.internal").unwrap().dsn();
    assert_eq!(
      dsn,
      "postgresql://postgres:secret@db.internal:5432/ret2shell?sslmode=prefer"
    );
  }

  #[test]
  fn merge_prefers_database_config_over_static_config() {
    assert_eq!(
      config("static").merge(config("database")),
      config("database")
    );
    assert_eq!(config("database").merge(None), config("database"));
    assert_eq!(None.merge(config("static")), config("static"));
    let none: Option<Config> = None;
    assert_eq!(none.merge(None), None);
  }
}

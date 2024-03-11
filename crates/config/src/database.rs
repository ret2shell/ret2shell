//! Contains the configuration for a database connection.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

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

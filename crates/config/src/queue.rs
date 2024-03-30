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
            (Some(a), Some(b)) => Some(Config {
                host: b.host,
                port: b.port.or(a.port),
                token: b.token.or(a.token),
                user: b.user.or(a.user),
                password: b.password.or(a.password),
                ping_interval: b.ping_interval.or(a.ping_interval),
                tls: b.tls.or(a.tls),
            }),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        }
    }
}

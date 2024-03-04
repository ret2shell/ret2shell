//! This module contains the configuration for a server.
use serde::{Deserialize, Serialize};

/// Represents the configuration for a server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// The host address of the server.
    pub host: String,
    /// The port number on which the server is listening.
    pub port: i16,
    /// The external host address of the server.
    pub external_domain: String,
    /// Indicates whether the server uses HTTPS for external connections.
    pub external_https: bool,
    /// The base path for the server's API.
    pub api_base_path: String,
    /// CORS rules enabled
    pub cors_origins: String,
    /// Initialize token
    pub init_token: String,
}

impl ServerConfig {
    /// Returns the external link prefix for the server, including the protocol
    /// (http or https).
    ///
    /// # Example
    ///
    /// ```
    /// let config = ServerConfig {
    ///     host: "localhost".to_string(),
    ///     port: 8080,
    ///     external_host: "example.com".to_string(),
    ///     external_https: true,
    ///     api_base_path: "/api".to_string(),
    /// };
    ///
    /// assert_eq!(config.external_link_prefix(), "https://example.com");
    /// ```
    #[allow(dead_code)]
    pub fn external_origin(&self) -> String {
        if self.external_https {
            format!("https://{}", self.external_domain)
        } else {
            format!("http://{}", self.external_domain)
        }
    }
}

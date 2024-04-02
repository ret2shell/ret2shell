//! This module contains the configuration for a server.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq, Default)]
pub struct Config {
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

    pub name: Option<String>,
    pub footer_info: Option<String>,
    pub footer_url: Option<String>,
    pub subject_info: Option<String>,
    pub subject_url: Option<String>,
    pub record: Option<String>,
    pub hide_maker: Option<bool>,
}

impl Config {
    /// Returns the external link prefix for the server, including the protocol
    /// (http or https).
    ///
    /// # Example
    ///
    /// ```
    /// let config = server::StaticConfig {
    ///     host: "localhost".to_string(),
    ///     port: 8080,
    ///     external_host: "example.com".to_string(),
    ///     external_https: true,
    ///     api_base_path: "/api".to_string(),
    /// };
    ///
    /// assert_eq!(config.external_link_prefix(), "https://example.com");
    /// ```
    pub fn external_origin(&self) -> String {
        if self.external_https {
            format!("https://{}", self.external_domain)
        } else {
            format!("http://{}", self.external_domain)
        }
    }

    pub fn desensitize(&self) -> Self {
        Self {
            host: "".to_string(),
            port: 0,
            external_domain: self.external_domain.clone(),
            external_https: self.external_https,
            api_base_path: self.api_base_path.clone(),
            cors_origins: "".to_string(),
            name: self.name.clone(),
            footer_info: self.footer_info.clone(),
            footer_url: self.footer_url.clone(),
            subject_info: self.subject_info.clone(),
            subject_url: self.subject_url.clone(),
            record: self.record.clone(),
            hide_maker: self.hide_maker,
        }
    }
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers fields in `other`
        match (self, other) {
            (Some(a), Some(b)) => Some(Config {
                host: b.host,
                port: b.port,
                external_domain: b.external_domain,
                external_https: b.external_https,
                api_base_path: b.api_base_path,
                cors_origins: b.cors_origins,
                name: b.name.or(a.name),
                footer_info: b.footer_info.or(a.footer_info),
                footer_url: b.footer_url.or(a.footer_url),
                subject_info: b.subject_info.or(a.subject_info),
                subject_url: b.subject_url.or(a.subject_url),
                record: b.record.or(a.record),
                hide_maker: b.hide_maker.or(a.hide_maker),
            }),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        }
    }
}

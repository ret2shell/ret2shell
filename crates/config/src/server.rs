//! This module contains the configuration for a server.
use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, FromJsonQueryResult, Default)]
#[serde(rename_all = "snake_case")]
pub enum FrontendServeType {
  #[default]
  Static,
  Proxy,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, FromJsonQueryResult, PartialEq, Eq)]
pub struct FrontendConfig {
  pub serve_type: FrontendServeType,
  pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, FromJsonQueryResult, PartialEq, Eq)]
pub struct RateLimitConfig {
  // /// request rate per 5 seconds
  // pub api_rate_limit: Option<i32>,
  /// Rate limit use Generic cell rate algorithm
  /// https://en.wikipedia.org/wiki/Generic_cell_rate_algorithm
  pub burst_limit: Option<u32>,
  pub burst_restore_rate: Option<u64>, // in milliseconds
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, FromJsonQueryResult, PartialEq, Eq)]
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
  /// API request rate config limit
  pub rate_limit: Option<RateLimitConfig>,
  /// Frontend configuration
  pub frontend: Option<FrontendConfig>,

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
      frontend: None,
      name: self.name.clone(),
      footer_info: self.footer_info.clone(),
      footer_url: self.footer_url.clone(),
      subject_info: self.subject_info.clone(),
      subject_url: self.subject_url.clone(),
      record: self.record.clone(),
      hide_maker: self.hide_maker,
      // api_rate_limit: self.api_rate_limit,
      rate_limit: None,
    }
  }
}

impl Merge for Option<Config> {
  fn merge(self, other: Self) -> Self {
    // prefers fields in `other`
    match (self, other) {
      (Some(a), Some(b)) => Some(Config {
        host: a.host,
        port: a.port,
        external_domain: a.external_domain,
        external_https: a.external_https,
        api_base_path: a.api_base_path,
        cors_origins: a.cors_origins,
        frontend: a.frontend,
        name: b.name.or(a.name),
        footer_info: b.footer_info.or(a.footer_info),
        footer_url: b.footer_url.or(a.footer_url),
        subject_info: b.subject_info.or(a.subject_info),
        subject_url: b.subject_url.or(a.subject_url),
        record: b.record.or(a.record),
        hide_maker: b.hide_maker.or(a.hide_maker),
        // api_rate_limit: b.api_rate_limit.or(a.api_rate_limit),
        rate_limit: a.rate_limit,
      }),
      (Some(a), None) => Some(a),
      (None, Some(b)) => Some(b),
      (None, None) => None,
    }
  }
}

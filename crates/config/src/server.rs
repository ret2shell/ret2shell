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
  pub highlight_banner: Option<String>,
  pub zen_game: Option<i64>,
}

impl Config {
  /// Returns the external link prefix for the server, including the protocol
  /// (http or https).
  ///
  /// # Example
  ///
  /// ```
  /// use r2s_config::server::Config;
  ///
  /// let config = Config {
  ///   host: "localhost".to_string(),
  ///   port: 8080,
  ///   external_domain: "example.com".to_string(),
  ///   external_https: true,
  ///   api_base_path: "/api".to_string(),
  ///   cors_origins: String::new(),
  ///   rate_limit: None,
  ///   frontend: None,
  ///   name: None,
  ///   footer_info: None,
  ///   footer_url: None,
  ///   subject_info: None,
  ///   subject_url: None,
  ///   record: None,
  ///   hide_maker: None,
  ///   highlight_banner: None,
  ///   zen_game: None,
  /// };
  ///
  /// assert_eq!(config.external_origin(), "https://example.com");
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
      highlight_banner: self.highlight_banner.clone(),
      // api_rate_limit: self.api_rate_limit,
      rate_limit: None,
      zen_game: self.zen_game,
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
        highlight_banner: b.highlight_banner.or(a.highlight_banner),
        // api_rate_limit: b.api_rate_limit.or(a.api_rate_limit),
        rate_limit: a.rate_limit,
        zen_game: b.zen_game.or(a.zen_game),
      }),
      (Some(a), None) => Some(a),
      (None, Some(b)) => Some(b),
      (None, None) => None,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::{Config, FrontendConfig, FrontendServeType, RateLimitConfig};
  use crate::traits::Merge;

  fn server_config() -> Config {
    Config {
      host: "0.0.0.0".to_owned(),
      port: 8080,
      external_domain: "ret2shell.example".to_owned(),
      external_https: true,
      api_base_path: "/api".to_owned(),
      cors_origins: "https://app.example".to_owned(),
      rate_limit: Some(RateLimitConfig {
        burst_limit: Some(60),
        burst_restore_rate: Some(500),
      }),
      frontend: Some(FrontendConfig {
        serve_type: FrontendServeType::Proxy,
        path: "/srv/ret2shell/web".to_owned(),
      }),
      name: Some("Ret2Shell".to_owned()),
      footer_info: Some("Base footer".to_owned()),
      footer_url: Some("https://ret2shell.example/footer".to_owned()),
      subject_info: Some("CTF platform".to_owned()),
      subject_url: Some("https://ret2shell.example/about".to_owned()),
      record: Some("ICP 000001".to_owned()),
      hide_maker: Some(false),
      highlight_banner: Some("Welcome banner".to_owned()),
      zen_game: Some(7),
    }
  }

  #[test]
  fn external_origin_uses_configured_scheme() {
    let https = server_config();
    let http = Config {
      external_https: false,
      ..server_config()
    };

    assert_eq!(https.external_origin(), "https://ret2shell.example");
    assert_eq!(http.external_origin(), "http://ret2shell.example");
  }

  #[test]
  fn desensitize_redacts_internal_network_and_runtime_settings() {
    let desensitized = server_config().desensitize();

    assert_eq!(desensitized.host, "");
    assert_eq!(desensitized.port, 0);
    assert_eq!(desensitized.cors_origins, "");
    assert_eq!(desensitized.rate_limit, None);
    assert_eq!(desensitized.frontend, None);
    assert_eq!(desensitized.external_domain, "ret2shell.example");
    assert_eq!(desensitized.api_base_path, "/api");
    assert_eq!(desensitized.name.as_deref(), Some("Ret2Shell"));
    assert_eq!(
      desensitized.highlight_banner.as_deref(),
      Some("Welcome banner")
    );
    assert_eq!(desensitized.zen_game, Some(7));
  }

  #[test]
  fn merge_keeps_base_connection_settings_and_falls_back_for_optional_metadata() {
    let base = Some(server_config());
    let overlay = Some(Config {
      host: "127.0.0.1".to_owned(),
      port: 9090,
      external_domain: "override.example".to_owned(),
      external_https: false,
      api_base_path: "/ignored".to_owned(),
      cors_origins: "https://ignored.example".to_owned(),
      rate_limit: Some(RateLimitConfig {
        burst_limit: Some(1),
        burst_restore_rate: Some(1),
      }),
      frontend: Some(FrontendConfig {
        serve_type: FrontendServeType::Static,
        path: "/tmp/ignored".to_owned(),
      }),
      name: Some("Override name".to_owned()),
      footer_info: None,
      footer_url: Some("https://override.example/footer".to_owned()),
      subject_info: Some("Override subject".to_owned()),
      subject_url: None,
      record: Some("ICP 000002".to_owned()),
      hide_maker: Some(true),
      highlight_banner: None,
      zen_game: None,
    });

    let merged = base.merge(overlay).unwrap();

    assert_eq!(merged.host, "0.0.0.0");
    assert_eq!(merged.port, 8080);
    assert_eq!(merged.external_domain, "ret2shell.example");
    assert!(merged.external_https);
    assert_eq!(merged.api_base_path, "/api");
    assert_eq!(merged.cors_origins, "https://app.example");
    assert_eq!(
      merged.rate_limit,
      Some(RateLimitConfig {
        burst_limit: Some(60),
        burst_restore_rate: Some(500),
      })
    );
    assert_eq!(
      merged.frontend,
      Some(FrontendConfig {
        serve_type: FrontendServeType::Proxy,
        path: "/srv/ret2shell/web".to_owned(),
      })
    );
    assert_eq!(merged.name.as_deref(), Some("Override name"));
    assert_eq!(merged.footer_info.as_deref(), Some("Base footer"));
    assert_eq!(
      merged.footer_url.as_deref(),
      Some("https://override.example/footer")
    );
    assert_eq!(merged.subject_info.as_deref(), Some("Override subject"));
    assert_eq!(
      merged.subject_url.as_deref(),
      Some("https://ret2shell.example/about")
    );
    assert_eq!(merged.record.as_deref(), Some("ICP 000002"));
    assert_eq!(merged.hide_maker, Some(true));
    assert_eq!(merged.highlight_banner.as_deref(), Some("Welcome banner"));
    assert_eq!(merged.zen_game, Some(7));
  }
}

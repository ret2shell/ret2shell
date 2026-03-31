//! This module loads the configuration from the file and provided them to other
//! modules.
//!
//! # Configuration file
//!
//! We use `toml` crate to parse configuration file.
//!
//! The configuration file will be looked up in the following order:
//!
//! 1. `./config/config.toml`: the current working directory
//! 2. `~/.config/ret2shell/config.toml`: the user's XDG config directory
//! 3. `/etc/ret2shell/config.toml`: the system config directory
//!
//! `ret2shell` server will try them in order and use the first one it found.
//!
//! # Management
//!
//! In previous Cyber Terminal implementations, the config file could be
//! modified on-the-fly and the server will reload the configuration
//! automatically. This affects the ability to implement cluster deployment and
//! load balancing on the server, so we removed this feature on `ret2shell`. The
//! configuration file will be readonly after the server started.
//!
//! If you want to change the configuration, you should manually edit it through
//! DevOps tools then restart the server.
//!
//! For convenience, we move some configurations into the database, so that you
//! can still change them through the web interface.
use std::path::Path;

use serde::{Deserialize, Serialize};
use thiserror::Error;
pub use toml;
pub mod auditor;
pub mod auth;
pub mod bucket;
pub mod cache;
pub mod captcha;
pub mod cluster;
pub mod database;
pub mod email;
pub mod logging;
pub mod media;
pub mod queue;
pub mod server;
pub mod traits;

#[derive(Error, Debug)]
pub enum ConfigError {
  #[error("configuration file not found")]
  NotFound,
  #[error("configuration file is invalid")]
  Invalid,
  #[error("deserialize failed: {0}")]
  DeserializeFailed(#[from] toml::de::Error),
}

/// Represents the configuration for the whole application.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {
  pub auditor: Option<auditor::Config>,
  pub auth: Option<auth::Config>,
  pub bucket: Option<bucket::Config>,
  pub cache: Option<cache::Config>,
  pub captcha: Option<captcha::Config>,
  pub cluster: Option<cluster::Config>,
  pub database: Option<database::Config>,
  pub email: Option<email::Config>,
  pub logging: Option<logging::Config>,
  pub media: Option<media::Config>,
  pub queue: Option<queue::Config>,
  pub server: Option<server::Config>,
}

// Predefined paths for the configuration file.
const CONFIG_PREDEFINED_PATH: [&str; 3] = ["/etc/ret2shell/", "~/.config/ret2shell/", "./config/"];

// Predefined file name for the configuration file.
const CONFIG_PREDEFINED_FILE_NAME: &str = "config.toml";

impl GlobalConfig {
  /// Load the GlobalConfig from a configuration file.
  /// It searches for the configuration file in predefined paths and returns
  /// the loaded configuration.
  pub fn load() -> Result<Self, ConfigError> {
    // load config str from predefined paths
    let mut config_str = String::new();
    let mut ok = false;
    for path in CONFIG_PREDEFINED_PATH.iter() {
      let path = match Path::new(path).canonicalize() {
        Ok(p) => p,
        Err(_) => {
          // println!("[stage 1] config path error: {err:?}, original path: {path}");
          continue;
        }
      };
      // println!("config file path is: {path:?}");
      let file_path = path.join(CONFIG_PREDEFINED_FILE_NAME);
      match std::fs::read_to_string(&file_path) {
        Ok(s) => {
          config_str = s;
          ok = true;
          break;
        }
        Err(_) => {
          // println!("[stage 2] config path error: {err:?}, original path: {path:?}");
          continue;
        }
      }
    }
    if !ok || config_str.is_empty() {
      return Err(ConfigError::NotFound);
    }
    // load config from config str
    let config: GlobalConfig = toml::from_str(&config_str)?;
    Ok(config)
  }
}

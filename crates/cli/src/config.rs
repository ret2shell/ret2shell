use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{CliError, CliResult};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ClientConfig {
  pub base_url: Option<String>,
  pub token: Option<String>,
}

impl ClientConfig {
  pub fn load() -> CliResult<Self> {
    let path = config_path()?;
    if !path.exists() {
      return Ok(Self::default());
    }
    let content = std::fs::read_to_string(&path)
      .map_err(|e| CliError::Config(format!("failed to read config: {e}")))?;
    toml::from_str(&content).map_err(|e| CliError::Config(format!("failed to parse config: {e}")))
  }

  pub fn save(&self) -> CliResult<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent)
        .map_err(|e| CliError::Config(format!("failed to create config dir: {e}")))?;
    }
    let content = toml::to_string_pretty(self)
      .map_err(|e| CliError::Config(format!("failed to serialize config: {e}")))?;
    std::fs::write(&path, content)
      .map_err(|e| CliError::Config(format!("failed to write config: {e}")))?;
    Ok(())
  }
}

fn config_path() -> CliResult<PathBuf> {
  let dir = std::env::var("XDG_CONFIG_HOME")
    .map(PathBuf::from)
    .or_else(|_| {
      dirs_path().ok_or_else(|| CliError::Config("cannot determine config directory".to_owned()))
    })?;
  Ok(dir.join("ret2shell").join("client.toml"))
}

fn dirs_path() -> Option<PathBuf> {
  #[cfg(target_os = "windows")]
  {
    std::env::var("APPDATA").ok().map(PathBuf::from)
  }
  #[cfg(not(target_os = "windows"))]
  {
    std::env::var("HOME")
      .ok()
      .map(|h| PathBuf::from(h).join(".config"))
  }
}

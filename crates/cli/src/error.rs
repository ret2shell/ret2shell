use reqwest::StatusCode;
use serde_json::json;
use thiserror::Error;

pub type CliResult<T> = Result<T, CliError>;

#[derive(Debug, Error)]
pub enum CliError {
  #[error("{0}")]
  Config(String),
  #[error("{0}")]
  Request(#[from] reqwest::Error),
  #[error("failed to serialize response: {0}")]
  Serialize(#[from] serde_json::Error),
  #[error("file io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("server returned {status}: {message}")]
  Api { status: StatusCode, message: String },
}

impl CliError {
  pub fn exit_code(&self) -> i32 {
    match self {
      Self::Config(_) | Self::Serialize(_) | Self::Io(_) => 1,
      Self::Request(_) => 5,
      Self::Api { status, .. } if *status == StatusCode::UNAUTHORIZED => 2,
      Self::Api { status, .. } if *status == StatusCode::FORBIDDEN => 3,
      Self::Api { status, .. } if *status == StatusCode::NOT_FOUND => 4,
      Self::Api { status, .. } if status.is_server_error() => 5,
      Self::Api { .. } => 1,
    }
  }

  pub fn as_json(&self) -> serde_json::Value {
    match self {
      Self::Api { status, message } => json!({
        "error": message,
        "status": status.as_u16(),
      }),
      _ => json!({
        "error": self.to_string(),
      }),
    }
  }
}

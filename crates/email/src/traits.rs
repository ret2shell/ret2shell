use r2s_config::email;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EmailCtx {
  pub name: String,
  pub email: String,
  pub subject: String,
  pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EmailRequest {
  pub email: EmailCtx,
  pub config: email::Config,
}

#[derive(Error, Debug)]
pub enum EmailError {
  #[error("invalid email tls configuration: {0}")]
  InvalidEmailTlsConfiguration(String),
  #[error("mailer error: {0}")]
  MailerError(#[from] lettre::transport::smtp::Error),
  #[error("serde error: {0}")]
  SerdeError(#[from] serde_json::Error),
  #[error("utf8 error: {0}")]
  Utf8Error(#[from] std::string::FromUtf8Error),
  #[error("lettre error: {0}")]
  LettreError(#[from] lettre::error::Error),
  #[error("address error: {0}")]
  AddressError(#[from] lettre::address::AddressError),
}

impl EmailError {
  pub fn can_retry(&self) -> bool {
    match self {
      EmailError::MailerError(error) => !error.is_permanent(),
      EmailError::InvalidEmailTlsConfiguration(_) => false,
      EmailError::SerdeError(_) => false,
      EmailError::Utf8Error(_) => false,
      EmailError::LettreError(error) => matches!(error, lettre::error::Error::Io(_)),
      EmailError::AddressError(_) => false,
    }
  }
}

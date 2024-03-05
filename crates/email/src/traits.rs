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
pub struct EmailConfig {
    /// The email server host.
    pub host: String,
    /// The email server port.
    pub port: u16,
    /// The email address used as the sender.
    pub sender: String,
    /// The username for authentication with the email server.
    pub username: String,
    /// The password for authentication with the email server.
    pub password: String,
    /// The TLS configuration for secure email communication.
    pub tls: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EmailRequest {
    pub email: EmailCtx,
    pub config: EmailConfig,
}

#[derive(Error, Debug)]
pub enum EmailError {
    #[error("Invalid email tls configuration: {0}")]
    InvalidEmailTlsConfiguration(String),
    #[error("mailer error: {0}")]
    MailerError(#[from] lettre::transport::smtp::Error),
    #[error("serde error: {0}")]
    SerdeError(#[from] serde_json::Error),
    #[error("utf8 error: {0}")]
    Utf8Error(#[from] std::string::FromUtf8Error),
}

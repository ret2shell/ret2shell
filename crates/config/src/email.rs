use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// Whether email functionality is enabled or not.
    pub enabled: bool,
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
    /// The email body for reset password emails
    /// could be 'none' | 'tls' | 'starttls'
    pub reset_password_email_body: Option<String>,
    /// The email subject for reset password emails.
    pub reset_password_email_subject: Option<String>,
    /// The email body for email verification emails.
    pub verify_email_body: Option<String>,
    /// The email subject for email verification emails.
    pub verify_email_subject: Option<String>,
}

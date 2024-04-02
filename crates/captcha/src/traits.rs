use r2s_config::captcha::ValidatorType;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Captcha struct for storing captcha data
#[derive(Serialize, Deserialize, Default, Debug, Clone)]
pub struct Captcha {
    /// Unique identifier for the captcha
    pub id: String,
    /// Validator type for the captcha
    pub validator: ValidatorType,
    /// Challenge string for the captcha
    pub challenge: String,
    /// Answer string for the captcha
    pub criteria: Option<String>,
}

impl Captcha {
    pub fn desensitize(self) -> Self {
        Self {
            criteria: None,
            ..self
        }
    }
}

#[derive(Debug, Error)]
pub enum CaptchaError {
    #[error("Failed to build captcha: {0}")]
    FailedToBuild(String),
    #[error("Missing fields: {0}")]
    MissingFields(String),
    #[error("serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    #[error("Uknown captcha type: {0}")]
    UnknownType(String),
    #[error("Uknown error")]
    Unknown,
}

#[async_trait::async_trait]
/// A trait for captcha validators.
pub trait CaptchaValidator: Send + Sync {
    async fn generate_captcha(difficulty: u16) -> Result<Captcha, CaptchaError>;

    async fn check_captcha(captcha: &Captcha, answer: &str) -> Result<bool, CaptchaError>;
}

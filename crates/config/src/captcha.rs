use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

/// Validator enum for different types of captcha validation
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, FromJsonQueryResult, Default)]
#[serde(rename_all = "snake_case")]
pub enum ValidatorType {
    #[default]
    None,
    Image,
    Pow,
    RecaptchaV3,
    HCaptcha,
}

#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    /// Whether captcha functionality is enabled or not.
    pub enabled: bool,
    /// The captcha difficulty.
    pub difficulty: Option<u16>,
    /// The captcha validator to use.
    pub validator: String,
}

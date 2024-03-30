use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

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
    pub validator: ValidatorType,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers fields in `other`
        match (self, other) {
            (Some(a), Some(b)) => Some(Config {
                enabled: b.enabled,
                difficulty: b.difficulty.or(a.difficulty),
                validator: b.validator,
            }),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        }
    }
}

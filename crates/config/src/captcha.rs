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

#[cfg(test)]
mod tests {
  use super::{Config, ValidatorType};
  use crate::traits::Merge;

  fn config(enabled: bool, difficulty: Option<u16>, validator: ValidatorType) -> Option<Config> {
    Some(Config {
      enabled,
      difficulty,
      validator,
    })
  }

  #[test]
  fn merge_takes_overlay_switch_and_validator_with_base_difficulty_fallback() {
    let merged = config(true, Some(3), ValidatorType::Pow)
      .merge(config(false, None, ValidatorType::Image))
      .unwrap();

    assert!(!merged.enabled);
    assert_eq!(merged.validator, ValidatorType::Image);
    assert_eq!(merged.difficulty, Some(3));
  }

  #[test]
  fn merge_falls_back_to_the_other_side_when_one_side_is_missing() {
    assert!(
      config(true, None, ValidatorType::Pow)
        .merge(None)
        .unwrap()
        .enabled
    );
    assert_eq!(
      None
        .merge(config(false, Some(5), ValidatorType::None))
        .unwrap()
        .difficulty,
      Some(5)
    );
    let none: Option<Config> = None;
    assert_eq!(none.merge(None), None);
  }

  #[test]
  fn validator_type_serializes_as_snake_case_tags() {
    assert_eq!(
      serde_json::to_value(ValidatorType::RecaptchaV3).unwrap(),
      "recaptcha_v3"
    );
    assert_eq!(
      serde_json::to_value(ValidatorType::HCaptcha).unwrap(),
      "h_captcha"
    );
    assert_eq!(
      serde_json::from_str::<ValidatorType>("\"recaptcha_v3\"").unwrap(),
      ValidatorType::RecaptchaV3
    );
  }
}

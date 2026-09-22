//! Generating captcha and verifying the captcha.

pub mod hcaptcha;
pub mod image;
pub mod pow;
pub mod recaptcha;
mod traits;
mod utils;

use r2s_config::captcha::ValidatorType;
pub use traits::{Captcha, CaptchaError, CaptchaValidator};

/// Generate a captcha. you should desensitize the captcha before sending it to
/// the client, and store the original captcha object into cache.
///
/// * `validator` - The type of the validator.
/// * `difficulty` - The difficulty of the captcha.
pub async fn generate(validator: &ValidatorType, difficulty: u16) -> Result<Captcha, CaptchaError> {
  match *validator {
    ValidatorType::None => Ok(Captcha {
      id: "".to_string(),
      validator: ValidatorType::None,
      challenge: "".to_string(),
      criteria: None,
    }),
    ValidatorType::Image => Ok(image::ImageValidator::generate_captcha(difficulty).await?),
    ValidatorType::Pow => Ok(pow::PowValidator::generate_captcha(difficulty).await?),
    ValidatorType::RecaptchaV3 => {
      Ok(recaptcha::ReCaptchaV3Validator::generate_captcha(difficulty).await?)
    }
    ValidatorType::HCaptcha => Ok(hcaptcha::HCaptchaValidator::generate_captcha(difficulty).await?),
  }
}

/// Check if the answer is correct.
///
/// * `validator` - The type of the validator.
/// * `captcha` - The captcha object from `generate` function, should be fetched
///   from cache.
/// * `answer` - The answer from the client.
pub async fn check(
  validator: &ValidatorType, captcha: &Captcha, answer: &str,
) -> Result<bool, CaptchaError> {
  match validator {
    ValidatorType::None => Ok(true),
    ValidatorType::Image => image::ImageValidator::check_captcha(captcha, answer).await,
    ValidatorType::Pow => pow::PowValidator::check_captcha(captcha, answer).await,
    ValidatorType::RecaptchaV3 => {
      recaptcha::ReCaptchaV3Validator::check_captcha(captcha, answer).await
    }
    ValidatorType::HCaptcha => hcaptcha::HCaptchaValidator::check_captcha(captcha, answer).await,
  }
}

#[cfg(test)]
mod tests {
  use r2s_config::captcha::ValidatorType;

  use super::{Captcha, check, generate};
  use crate::traits::{CaptchaError, CaptchaValidator};

  fn captcha(validator: ValidatorType, challenge: &str, criteria: Option<&str>) -> Captcha {
    Captcha {
      id: "captcha-id".to_owned(),
      validator,
      challenge: challenge.to_owned(),
      criteria: criteria.map(str::to_owned),
    }
  }

  #[tokio::test]
  async fn none_validator_accepts_everything_without_challenge() {
    let generated = generate(&ValidatorType::None, 1).await.unwrap();

    assert_eq!(generated.validator, ValidatorType::None);
    assert!(generated.challenge.is_empty());
    assert_eq!(generated.criteria, None);
    assert!(
      check(&ValidatorType::None, &generated, "anything")
        .await
        .unwrap()
    );
  }

  #[tokio::test]
  async fn image_validator_checks_answers_case_insensitively_and_trimmed() {
    let captcha = generate(&ValidatorType::Image, 2).await.unwrap();
    let answer = captcha.criteria.clone().unwrap();

    assert!(
      check(
        &ValidatorType::Image,
        &captcha,
        &format!(" {} ", answer.to_uppercase())
      )
      .await
      .unwrap()
    );
    assert!(
      !check(&ValidatorType::Image, &captcha, "wrong")
        .await
        .unwrap()
    );
  }

  #[tokio::test]
  async fn image_validator_requires_criteria() {
    let err = super::image::ImageValidator::check_captcha(
      &captcha(ValidatorType::Image, "challenge", None),
      "answer",
    )
    .await
    .unwrap_err();

    assert!(matches!(err, CaptchaError::MissingFields(field) if field == "criteria"));
  }
}

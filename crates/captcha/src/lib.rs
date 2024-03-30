//! Generating captcha and verifying the captcha.

pub mod hcaptcha;
pub mod image;
pub mod pow;
pub mod recaptcha;
mod traits;
mod utils;

use r2s_config::captcha::ValidatorType;
pub use traits::{Captcha, CaptchaError, CaptchaValidator};

/// Generate a captcha. you should desentisize the captcha before sending it to
/// the client, and store the original captcha object into cache.
///
/// * `validator` - The type of the validator.
/// * `difficulty` - The difficulty of the captcha.
pub async fn generate(validator: &ValidatorType, difficulty: u16) -> Result<Captcha, CaptchaError> {
    match validator {
        &ValidatorType::None => Ok(Captcha {
            id: "".to_string(),
            validator: ValidatorType::None,
            challenge: "".to_string(),
            criteria: None,
        }),
        &ValidatorType::Image => Ok(image::ImageValidator::generate_captcha(difficulty).await?),
        &ValidatorType::Pow => Ok(pow::PowValidator::generate_captcha(difficulty).await?),
        &ValidatorType::RecaptchaV3 => {
            Ok(recaptcha::ReCaptchaV3Validator::generate_captcha(difficulty).await?)
        }
        &ValidatorType::HCaptcha => {
            Ok(hcaptcha::HCaptchaValidator::generate_captcha(difficulty).await?)
        }
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
        ValidatorType::HCaptcha => {
            hcaptcha::HCaptchaValidator::check_captcha(captcha, answer).await
        }
    }
}

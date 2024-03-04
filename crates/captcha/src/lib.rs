//! Generating captcha and verifying the captcha.

pub mod hcaptcha;
pub mod image;
pub mod pow;
pub mod recaptcha;
mod traits;
mod utils;

use traits::ValidatorType;
pub use traits::{Captcha, CaptchaError, CaptchaValidator};

pub async fn generate_captcha(validator: &str, difficulty: &u16) -> Result<Captcha, CaptchaError> {
    match validator {
        "none" => Ok(Captcha {
            id: "".to_string(),
            validator: ValidatorType::None,
            challenge: "".to_string(),
            criteria: None,
        }),
        "image" => Ok(image::ImageValidator::generate_captcha(*difficulty).await?),
        "pow" => Ok(pow::PowValidator::generate_captcha(*difficulty).await?),
        "recaptcha_v3" => Ok(recaptcha::ReCaptchaV3Validator::generate_captcha(*difficulty).await?),
        "hcaptcha" => Ok(hcaptcha::HCaptchaValidator::generate_captcha(*difficulty).await?),
        n => Err(CaptchaError::UnknownType(n.to_string())),
    }
}

pub async fn check_captcha(
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

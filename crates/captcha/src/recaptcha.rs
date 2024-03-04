use super::traits::{Captcha, CaptchaError, CaptchaValidator};

pub struct ReCaptchaV3Validator;

#[async_trait::async_trait]
impl CaptchaValidator for ReCaptchaV3Validator {
    async fn generate_captcha(_difficulty: u16) -> Result<Captcha, CaptchaError> {
        Err(CaptchaError::Unknown)
    }

    async fn check_captcha(_captcha: &Captcha, _answer: &str) -> Result<bool, CaptchaError> {
        Err(CaptchaError::Unknown)
    }
}

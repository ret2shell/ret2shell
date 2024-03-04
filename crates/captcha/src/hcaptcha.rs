use super::traits::{Captcha, CaptchaError, CaptchaValidator};
pub struct HCaptchaValidator;
#[async_trait::async_trait]
impl CaptchaValidator for HCaptchaValidator {
    async fn generate_captcha(_difficulty: u16) -> Result<Captcha, CaptchaError> {
        Err(CaptchaError::Unknown)
    }

    async fn check_captcha(_captcha: &Captcha, _answer: &str) -> Result<bool, CaptchaError> {
        Err(CaptchaError::Unknown)
    }
}

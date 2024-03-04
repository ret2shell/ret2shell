use serde::{Deserialize, Serialize};

use super::{
    traits::{Captcha, CaptchaError, CaptchaValidator, ValidatorType},
    utils::sha256sum_str,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PowCaptchaCriteria {
    pub difficulty: u16,
    pub challenge: String,
}

pub struct PowValidator;
#[async_trait::async_trait]
impl CaptchaValidator for PowValidator {
    async fn generate_captcha(difficulty: u16) -> Result<Captcha, CaptchaError> {
        let id = nanoid::nanoid!();
        let challenge = nanoid::nanoid!(16);
        Ok(Captcha {
            id,
            validator: ValidatorType::Pow,
            challenge: format!("{}#{}", difficulty, challenge.clone()),
            criteria: Some(serde_json::to_string(&PowCaptchaCriteria {
                difficulty,
                challenge,
            })?),
        })
    }

    async fn check_captcha(captcha: &Captcha, answer: &str) -> Result<bool, CaptchaError> {
        let criteria = captcha
            .criteria
            .clone()
            .ok_or(CaptchaError::MissingFields("criteria".to_string()))?;
        let criteria: PowCaptchaCriteria = serde_json::from_str(&criteria)?;
        if answer.trim().starts_with(criteria.challenge.trim())
            && sha256sum_str(answer.trim())
                .starts_with("0".repeat(criteria.difficulty as usize).as_str())
        {
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

use super::traits::{Captcha, CaptchaError, CaptchaValidator, ValidatorType};

pub struct ImageValidator;
#[async_trait::async_trait]
impl CaptchaValidator for ImageValidator {
    async fn generate_captcha(difficulty: u16) -> Result<Captcha, CaptchaError> {
        let (answer, challenge) = biosvg::BiosvgBuilder::new()
            .length(4)
            .difficulty(difficulty)
            .colors(vec![
                "#0078D6".to_string(),
                "#aa3333".to_string(),
                "#f08012".to_string(),
                "#33aa00".to_string(),
                "#AA00AA".to_string(),
                "#44CC7F".to_string(),
            ])
            .build()
            .map_err(|err| CaptchaError::FailedToBuild(err.to_string()))?;
        let id = nanoid::nanoid!();

        Ok(Captcha {
            id,
            validator: ValidatorType::Image,
            challenge,
            criteria: Some(answer),
        })
    }

    async fn check_captcha(captcha: &Captcha, answer: &str) -> Result<bool, CaptchaError> {
        Ok(captcha
            .criteria
            .clone()
            .ok_or(CaptchaError::MissingFields("criteria".to_owned()))?
            .trim()
            .to_lowercase()
            == answer.trim().to_lowercase())
    }
}

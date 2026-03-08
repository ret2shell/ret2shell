use r2s_config::captcha::ValidatorType;
use serde::{Deserialize, Serialize};

use super::{
  traits::{Captcha, CaptchaError, CaptchaValidator},
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
      && sha256sum_str(answer.trim()).starts_with("0".repeat(criteria.difficulty as usize).as_str())
    {
      Ok(true)
    } else {
      Ok(false)
    }
  }
}

#[cfg(test)]
mod tests {
  use r2s_config::captcha::ValidatorType;

  use super::{PowCaptchaCriteria, PowValidator, sha256sum_str};
  use crate::{Captcha, CaptchaError, CaptchaValidator};

  fn captcha(criteria: PowCaptchaCriteria) -> Captcha {
    Captcha {
      id: "captcha-id".to_owned(),
      validator: ValidatorType::Pow,
      challenge: format!("{}#{}", criteria.difficulty, criteria.challenge),
      criteria: Some(serde_json::to_string(&criteria).unwrap()),
    }
  }

  #[tokio::test]
  async fn generate_captcha_serializes_matching_challenge_and_criteria() {
    let captcha = PowValidator::generate_captcha(3).await.unwrap();
    let criteria: PowCaptchaCriteria =
      serde_json::from_str(captcha.criteria.as_deref().unwrap()).unwrap();

    assert_eq!(captcha.validator, ValidatorType::Pow);
    assert_eq!(
      captcha.challenge,
      format!("{}#{}", criteria.difficulty, criteria.challenge)
    );
    assert_eq!(criteria.difficulty, 3);
    assert!(!captcha.id.is_empty());
    assert!(!criteria.challenge.is_empty());
  }

  #[tokio::test]
  async fn check_captcha_accepts_trimmed_answers_with_matching_prefix() {
    let captcha = captcha(PowCaptchaCriteria {
      difficulty: 0,
      challenge: "seed".to_owned(),
    });

    assert!(
      PowValidator::check_captcha(&captcha, "  seed-suffix  ")
        .await
        .unwrap()
    );
    assert!(
      !PowValidator::check_captcha(&captcha, "prefix-seed")
        .await
        .unwrap()
    );
  }

  #[tokio::test]
  async fn check_captcha_enforces_hash_difficulty_for_nonzero_puzzles() {
    let criteria = PowCaptchaCriteria {
      difficulty: 1,
      challenge: "proof".to_owned(),
    };
    let captcha = captcha(criteria.clone());
    let answer = (0u64..)
      .map(|nonce| format!("{}-{nonce}", criteria.challenge))
      .find(|candidate| sha256sum_str(candidate).starts_with('0'))
      .unwrap();

    assert!(
      PowValidator::check_captcha(&captcha, &answer)
        .await
        .unwrap()
    );
    assert!(
      !PowValidator::check_captcha(&captcha, &criteria.challenge)
        .await
        .unwrap()
    );
  }

  #[tokio::test]
  async fn check_captcha_requires_serialized_criteria() {
    let err = PowValidator::check_captcha(
      &Captcha {
        id: "captcha-id".to_owned(),
        validator: ValidatorType::Pow,
        challenge: "0#seed".to_owned(),
        criteria: None,
      },
      "seed",
    )
    .await
    .unwrap_err();

    assert!(matches!(err, CaptchaError::MissingFields(field) if field == "criteria"));
  }
}

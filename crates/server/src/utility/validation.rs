use r2s_database::{challenge, game, oauth_provider};

use crate::{traits::ResponseError, utility::string::account_str};

fn char_len(value: &str) -> usize {
  value.chars().count()
}

fn validate_required(value: &str, field: &str) -> Result<(), ResponseError> {
  if value.trim().is_empty() {
    return Err(ResponseError::BadRequest(format!("{field} is required")));
  }
  Ok(())
}

fn validate_max_len(value: &str, field: &str, max: usize) -> Result<(), ResponseError> {
  if char_len(value) > max {
    return Err(ResponseError::BadRequest(format!(
      "{field} must be at most {max} characters"
    )));
  }
  Ok(())
}

fn validate_range(value: i32, field: &str, min: i32, max: i32) -> Result<(), ResponseError> {
  if !(min..=max).contains(&value) {
    return Err(ResponseError::BadRequest(format!(
      "{field} must be between {min} and {max}"
    )));
  }
  Ok(())
}

pub fn validate_account(account: &str) -> Result<(), ResponseError> {
  let len = char_len(account);
  if len < 4 {
    return Err(ResponseError::BadRequest(
      "account must be at least 4 characters".to_owned(),
    ));
  }
  if len > 32 {
    return Err(ResponseError::BadRequest(
      "account must be at most 32 characters".to_owned(),
    ));
  }
  if account_str(account) != account {
    return Err(ResponseError::BadRequest(
      "account contains invalid characters".to_owned(),
    ));
  }
  Ok(())
}

pub fn validate_nickname(nickname: &str) -> Result<(), ResponseError> {
  let len = char_len(nickname);
  if len < 2 {
    return Err(ResponseError::BadRequest(
      "nickname must be at least 2 characters".to_owned(),
    ));
  }
  if len > 32 {
    return Err(ResponseError::BadRequest(
      "nickname must be at most 32 characters".to_owned(),
    ));
  }
  Ok(())
}

pub fn validate_email(email: &str) -> Result<(), ResponseError> {
  let Some((local, domain)) = email.split_once('@') else {
    return Err(ResponseError::BadRequest("invalid email".to_owned()));
  };
  if local.is_empty()
    || domain.is_empty()
    || domain.contains('@')
    || email.chars().any(char::is_whitespace)
    || !domain
      .split('.')
      .all(|label| !label.is_empty() && !label.starts_with('-') && !label.ends_with('-'))
    || !domain.contains('.')
  {
    return Err(ResponseError::BadRequest("invalid email".to_owned()));
  }
  Ok(())
}

pub fn validate_password(password: &str) -> Result<(), ResponseError> {
  let len = char_len(password);
  if !(8..=40).contains(&len)
    || !password.chars().any(|c| c.is_ascii_lowercase())
    || !password.chars().any(|c| c.is_ascii_uppercase())
    || !password.chars().any(|c| c.is_ascii_digit())
  {
    return Err(ResponseError::BadRequest("password is too weak".to_owned()));
  }
  Ok(())
}

pub fn validate_register_request(
  account: &str, nickname: &str, email: &str, password: &str,
) -> Result<(), ResponseError> {
  validate_account(account)?;
  validate_nickname(nickname)?;
  validate_email(email)?;
  validate_password(password)?;
  Ok(())
}

pub fn validate_team_form(name: &str, tag: Option<&str>) -> Result<(), ResponseError> {
  validate_required(name, "team name")?;
  validate_max_len(name, "team name", 32)?;
  if let Some(tag) = tag {
    validate_max_len(tag, "team tag", 32)?;
  }
  Ok(())
}

pub fn validate_game_model(game: &game::Model) -> Result<(), ResponseError> {
  validate_required(&game.name, "game name")?;
  validate_required(&game.brief, "game brief")?;

  if game.register_at > game.start_at {
    return Err(ResponseError::BadRequest(
      "register time must be before start time".to_owned(),
    ));
  }
  if game.start_at >= game.end_at {
    return Err(ResponseError::BadRequest(
      "start time must be before end time".to_owned(),
    ));
  }
  if game.end_at > game.archive_at {
    return Err(ResponseError::BadRequest(
      "archive time must be after end time".to_owned(),
    ));
  }

  if game.host_type == game::HostType::Game {
    validate_range(game.team_size, "team size", 0, 99)?;
  }
  if let Some(env_limit) = game.env_limit {
    validate_range(env_limit, "env limit", 1, 99)?;
  }
  validate_range(game.award_rate, "award rate", 0, 100)?;
  if let Some(award_rates) = &game.award_rates {
    for award_rate in &award_rates.0 {
      validate_range(*award_rate, "award rate", 0, 100)?;
    }
  }

  if let Some(timeline_presets) = &game.timeline_presets {
    for preset in &timeline_presets.0 {
      validate_required(&preset.label, "timeline label")?;
      if preset.start_at >= preset.end_at {
        return Err(ResponseError::BadRequest(
          "timeline start time must be before end time".to_owned(),
        ));
      }
      if preset.start_at < game.start_at || preset.end_at > game.end_at {
        return Err(ResponseError::BadRequest(
          "timeline must be inside game time range".to_owned(),
        ));
      }
    }
  }

  if let Some(url) = &game.hammer_policy.outer_url
    && !url.trim().is_empty()
    && (!url.starts_with("https://") && !url.starts_with("http://")
      || url.chars().any(char::is_whitespace))
  {
    return Err(ResponseError::BadRequest("invalid hammer url".to_owned()));
  }

  Ok(())
}

pub fn validate_challenge_model(challenge: &challenge::Model) -> Result<(), ResponseError> {
  validate_required(&challenge.name, "challenge name")?;
  validate_required(
    challenge.content.as_deref().unwrap_or_default(),
    "challenge content",
  )?;
  if challenge.tag.0.is_empty() {
    return Err(ResponseError::BadRequest(
      "challenge tag is required".to_owned(),
    ));
  }
  validate_range(challenge.score_rule.initial, "initial score", 0, 1500)?;
  validate_range(challenge.score_rule.minimum, "minimum score", 0, 1500)?;
  validate_range(challenge.score_rule.decay, "score decay", 1, 200)?;
  if challenge.score_rule.minimum > challenge.score_rule.initial {
    return Err(ResponseError::BadRequest(
      "minimum score must not exceed initial score".to_owned(),
    ));
  }
  if let (Some(release_at), Some(archive_at)) = (&challenge.release_at, &challenge.archive_at)
    && release_at >= archive_at
  {
    return Err(ResponseError::BadRequest(
      "challenge release time must be before archive time".to_owned(),
    ));
  }
  Ok(())
}

pub fn validate_oauth_provider_model(
  provider: &oauth_provider::Model,
) -> Result<(), ResponseError> {
  validate_required(&provider.name, "oauth provider name")?;
  let provider_len = char_len(&provider.provider);
  if !(2..=32).contains(&provider_len)
    || !provider
      .provider
      .chars()
      .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
  {
    return Err(ResponseError::BadRequest(
      "oauth provider contains invalid characters".to_owned(),
    ));
  }
  validate_required(&provider.script, "oauth provider script")?;
  if let Some(portal) = &provider.portal
    && !portal.trim().is_empty()
    && (!portal.starts_with("https://") && !portal.starts_with("http://")
      || portal.chars().any(char::is_whitespace))
  {
    return Err(ResponseError::BadRequest(
      "oauth provider portal is invalid".to_owned(),
    ));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::{
    validate_account, validate_email, validate_nickname, validate_password,
    validate_register_request,
  };

  #[test]
  fn register_validation_accepts_frontend_valid_fields() {
    assert!(
      validate_register_request(
        "Valid_User_01",
        "测试用户",
        "user@example.com",
        "StrongPass1"
      )
      .is_ok()
    );
  }

  #[test]
  fn register_validation_rejects_invalid_accounts_after_filtering() {
    assert!(validate_account("abc").is_err());
    assert!(validate_account("a".repeat(33).as_str()).is_err());
    assert!(validate_account("bad-user").is_err());
    assert!(validate_account("bad user").is_err());
    assert!(validate_account("测试_user").is_err());
  }

  #[test]
  fn register_validation_rejects_invalid_nickname_email_and_password() {
    assert!(validate_nickname("a").is_err());
    assert!(validate_nickname("a".repeat(33).as_str()).is_err());
    assert!(validate_email("not-an-email").is_err());
    assert!(validate_email("user@example").is_err());
    assert!(validate_password("weakpass1").is_err());
    assert!(validate_password("WEAKPASS1").is_err());
    assert!(validate_password("WeakPass").is_err());
    assert!(validate_password("Aa1".repeat(14).as_str()).is_err());
  }
}

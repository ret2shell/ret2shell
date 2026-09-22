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

#[cfg(test)]
mod model_validation_tests {
  use chrono::{Duration, Utc};
  use r2s_database::{challenge, game, oauth_provider};

  use super::{
    validate_challenge_model, validate_game_model, validate_oauth_provider_model,
    validate_team_form,
  };

  fn hours(n: i64) -> chrono::DateTime<Utc> {
    Utc::now() + Duration::hours(n)
  }

  fn valid_game() -> game::Model {
    game::Model {
      id: 1,
      updated_at: Utc::now(),
      name: "test game".to_owned(),
      brief: "a brief".to_owned(),
      introduction_id: None,
      register_at: hours(-48),
      start_at: hours(-24),
      end_at: hours(24),
      archive_at: hours(48),
      hidden: false,
      offline: false,
      frozen: false,
      host_type: game::HostType::Game,
      team_size: 4,
      env_limit: Some(2),
      access_policy: game::AccessPolicy {
        restrict: false,
        institutes: vec![],
        sync: 0,
      },
      archive_policy: game::ArchivePolicy::default(),
      hammer_policy: game::HammerPolicy {
        enabled: true,
        outer_label: Some("mirror".to_owned()),
        outer_url: Some("https://hammer.example.com".to_owned()),
      },
      cover: None,
      logo: None,
      enable_audit: true,
      can_register_after_started: false,
      award_rate: 30,
      award_rates: Some(game::AwardRates(vec![10, 20])),
      admins: game::Admins(vec![1]),
      weight: 0,
      bucket: None,
      token: None,
      timeline_presets: Some(game::TimelinePresets(vec![game::TimelinePreset {
        label: "warmup".to_owned(),
        start_at: hours(-24),
        end_at: hours(-12),
      }])),
      node_selector: None,
      traffic: None,
      lifecycle: None,
    }
  }

  fn assert_error_contains(result: Result<(), crate::traits::ResponseError>, needle: &str) {
    let message = result.expect_err("expected validation failure").to_string();
    assert!(message.contains(needle), "unexpected error: {message}");
  }

  #[test]
  fn complete_game_config_passes_validation() {
    assert!(validate_game_model(&valid_game()).is_ok());
  }

  #[test]
  fn training_games_skip_team_size_limits() {
    let mut game = valid_game();
    game.host_type = game::HostType::Training;
    game.team_size = 999;
    assert!(validate_game_model(&game).is_ok());
  }

  #[test]
  fn game_time_windows_must_be_chronological() {
    let mut game = valid_game();
    game.register_at = game.start_at + Duration::seconds(1);
    assert_error_contains(validate_game_model(&game), "register time");

    let mut game = valid_game();
    game.end_at = game.start_at;
    assert_error_contains(validate_game_model(&game), "start time");

    let mut game = valid_game();
    game.archive_at = game.end_at - Duration::seconds(1);
    assert_error_contains(validate_game_model(&game), "archive time");
  }

  #[test]
  fn numeric_fields_must_stay_within_bounds() {
    for team_size in [-1, 100] {
      let mut game = valid_game();
      game.team_size = team_size;
      assert_error_contains(validate_game_model(&game), "team size");
    }
    for env_limit in [0, 100] {
      let mut game = valid_game();
      game.env_limit = Some(env_limit);
      assert_error_contains(validate_game_model(&game), "env limit");
    }
    for award_rate in [-1, 101] {
      let mut game = valid_game();
      game.award_rate = award_rate;
      assert_error_contains(validate_game_model(&game), "award rate");
    }
    let mut game = valid_game();
    game.award_rates = Some(game::AwardRates(vec![10, 999]));
    assert_error_contains(validate_game_model(&game), "award rate");
  }

  #[test]
  fn missing_required_texts_are_reported() {
    let mut game = valid_game();
    game.name = "   ".to_owned();
    assert_error_contains(validate_game_model(&game), "name");

    let mut game = valid_game();
    game.brief = String::new();
    assert_error_contains(validate_game_model(&game), "brief");
  }

  #[test]
  fn timeline_presets_must_have_labels_and_fit_inside_the_game() {
    let mut game = valid_game();

    game.timeline_presets = Some(game::TimelinePresets(vec![game::TimelinePreset {
      label: String::new(),
      ..game.timeline_presets.as_ref().unwrap().0[0].clone()
    }]));
    assert_error_contains(validate_game_model(&game), "timeline label");

    game.timeline_presets = Some(game::TimelinePresets(vec![game::TimelinePreset {
      label: "backwards".to_owned(),
      start_at: hours(-12),
      end_at: hours(-24),
    }]));
    assert_error_contains(validate_game_model(&game), "timeline start time");

    game.timeline_presets = Some(game::TimelinePresets(vec![game::TimelinePreset {
      label: "too early".to_owned(),
      start_at: hours(-72),
      end_at: hours(-48),
    }]));
    assert_error_contains(
      validate_game_model(&game),
      "timeline must be inside game time range",
    );
  }

  #[test]
  fn hammer_outer_urls_must_be_http_links_without_whitespace() {
    for url in ["ftp://hammer.example.com", "https://hammer.example.com/a b"] {
      let mut game = valid_game();
      game.hammer_policy.outer_url = Some(url.to_owned());
      assert_error_contains(validate_game_model(&game), "invalid hammer url");
    }
    // Blank or absent urls are allowed.
    let mut blank = valid_game();
    blank.hammer_policy.outer_url = Some("   ".to_owned());
    assert!(validate_game_model(&blank).is_ok());
    let mut absent = valid_game();
    absent.hammer_policy.outer_url = None;
    assert!(validate_game_model(&absent).is_ok());
  }

  fn valid_challenge() -> challenge::Model {
    challenge::Model {
      id: 1,
      name: "babypwn".to_owned(),
      updated_at: Utc::now(),
      content: Some("<p>find the flag</p>".to_owned()),
      hidden: false,
      game_id: 1,
      // `Tag` fields are private, an empty default tag stands in for a real one.
      tag: challenge::TagList(vec![challenge::Tag::default()]),
      score_rule: challenge::ScoreRule {
        initial: 1000,
        minimum: 100,
        decay: 25,
      },
      score: 1000,
      bucket: None,
      ref_id: None,
      release_at: Some(hours(-24)),
      archive_at: Some(hours(24)),
    }
  }

  #[test]
  fn standard_challenge_config_passes_validation() {
    assert!(validate_challenge_model(&valid_challenge()).is_ok());
  }

  #[test]
  fn challenges_require_name_content_and_tags() {
    let mut challenge = valid_challenge();
    challenge.name = String::new();
    assert_error_contains(validate_challenge_model(&challenge), "name");

    let mut challenge = valid_challenge();
    challenge.content = None;
    assert_error_contains(validate_challenge_model(&challenge), "content");

    let mut challenge = valid_challenge();
    challenge.tag = challenge::TagList(vec![]);
    assert_error_contains(validate_challenge_model(&challenge), "tag");
  }

  #[test]
  fn score_rules_must_decay_from_initial_to_minimum() {
    let mut challenge = valid_challenge();
    challenge.score_rule.initial = -1;
    assert_error_contains(validate_challenge_model(&challenge), "initial score");

    let mut challenge = valid_challenge();
    challenge.score_rule.minimum = 1501;
    assert_error_contains(validate_challenge_model(&challenge), "minimum score");

    for decay in [0, 201] {
      let mut challenge = valid_challenge();
      challenge.score_rule.decay = decay;
      assert_error_contains(validate_challenge_model(&challenge), "score decay");
    }

    let mut challenge = valid_challenge();
    challenge.score_rule.minimum = 1001;
    assert_error_contains(
      validate_challenge_model(&challenge),
      "minimum score must not exceed initial score",
    );
  }

  #[test]
  fn challenges_cannot_archive_before_release() {
    let mut challenge = valid_challenge();
    challenge.archive_at = challenge.release_at;
    assert_error_contains(
      validate_challenge_model(&challenge),
      "release time must be before archive time",
    );

    let mut challenge = valid_challenge();
    challenge.release_at = Some(hours(48));
    assert_error_contains(
      validate_challenge_model(&challenge),
      "release time must be before archive time",
    );
  }

  fn valid_provider() -> oauth_provider::Model {
    oauth_provider::Model {
      id: 1,
      name: "GitHub".to_owned(),
      avatar: None,
      provider: "github".to_owned(),
      script: "pub async fn login(params) { ... }".to_owned(),
      portal: Some("https://github.com/login".to_owned()),
    }
  }

  #[test]
  fn canonical_oauth_provider_passes_validation() {
    assert!(validate_oauth_provider_model(&valid_provider()).is_ok());

    let mut no_portal = valid_provider();
    no_portal.portal = None;
    assert!(validate_oauth_provider_model(&no_portal).is_ok());
  }

  #[test]
  fn oauth_provider_identifiers_are_restricted_to_lowercase_slug_charset() {
    let mut provider = valid_provider();
    provider.name = String::new();
    assert_error_contains(
      validate_oauth_provider_model(&provider),
      "oauth provider name",
    );

    for bad in ["a", &"a".repeat(33), "GitHub", "git-hub"] {
      let mut provider = valid_provider();
      provider.provider = bad.to_owned();
      assert_error_contains(
        validate_oauth_provider_model(&provider),
        "invalid characters",
      );
    }
  }

  #[test]
  fn oauth_providers_require_scripts_and_valid_portals() {
    let mut provider = valid_provider();
    provider.script = String::new();
    assert_error_contains(
      validate_oauth_provider_model(&provider),
      "oauth provider script",
    );

    for portal in ["ftp://github.com/login", "https://github.com/with space"] {
      let mut provider = valid_provider();
      provider.portal = Some(portal.to_owned());
      assert_error_contains(
        validate_oauth_provider_model(&provider),
        "portal is invalid",
      );
    }

    let mut blank_portal = valid_provider();
    blank_portal.portal = Some(String::new());
    assert!(validate_oauth_provider_model(&blank_portal).is_ok());
  }

  #[test]
  fn team_forms_need_short_names_and_optional_short_tags() {
    assert!(validate_team_form("team rocket", None).is_ok());
    assert!(validate_team_form("team rocket", Some("RKT")).is_ok());

    assert_error_contains(validate_team_form("   ", None), "team name is required");
    assert_error_contains(validate_team_form(&"x".repeat(33), None), "at most 32");
    assert_error_contains(
      validate_team_form("team rocket", Some(&"y".repeat(33))),
      "at most 32",
    );
  }
}

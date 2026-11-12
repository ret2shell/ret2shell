use chrono::{DateTime, Utc};
use r2s_database::{game, sync_source};
use serde::Serialize;
use url::Url;

use crate::traits::{GlobalState, ResponseError};

/// Lower bound for a scheduled sync interval, one sync per minute at most.
pub(crate) const MIN_INTERVAL_SECONDS: i64 = 60;
/// Upper bound for a scheduled sync interval, one month at most.
pub(crate) const MAX_INTERVAL_SECONDS: i64 = 2_592_000;
/// Backoff multiplier base applied to consecutive failures.
const BACKOFF_BASE: i64 = 2;
/// Maximum backoff exponent, capping the delay independently of the interval.
const BACKOFF_MAX_EXPONENT: u32 = 5;

/// Sanitized sync source view: the credential never leaves the server.
#[derive(Serialize)]
pub(crate) struct PublicSource {
  pub id: i64,
  pub repository_url: String,
  pub local_game_id: i64,
  pub has_credential: bool,
  pub enabled: bool,
  pub interval_seconds: Option<i64>,
  pub last_synced_oid: Option<String>,
  pub next_sync_at: Option<DateTime<Utc>>,
  pub last_attempt_at: Option<DateTime<Utc>>,
  pub last_success_at: Option<DateTime<Utc>>,
  pub last_status: String,
  pub last_error: Option<String>,
  pub consecutive_failures: i32,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

impl From<sync_source::Model> for PublicSource {
  fn from(source: sync_source::Model) -> Self {
    Self {
      id: source.id,
      repository_url: source.repository_url,
      local_game_id: source.local_game_id,
      has_credential: !source.credential.is_empty(),
      enabled: source.enabled,
      interval_seconds: source.interval_seconds,
      last_synced_oid: source.last_synced_oid,
      next_sync_at: source.next_sync_at,
      last_attempt_at: source.last_attempt_at,
      last_success_at: source.last_success_at,
      last_status: source.last_status,
      last_error: source.last_error,
      consecutive_failures: source.consecutive_failures,
      created_at: source.created_at,
      updated_at: source.updated_at,
    }
  }
}

pub(crate) fn validate_interval(interval: Option<i64>) -> Result<(), ResponseError> {
  if let Some(interval) = interval
    && !(MIN_INTERVAL_SECONDS..=MAX_INTERVAL_SECONDS).contains(&interval)
  {
    return Err(ResponseError::BadRequest(format!(
      "interval_seconds must be between {MIN_INTERVAL_SECONDS} and {MAX_INTERVAL_SECONDS}"
    )));
  }
  Ok(())
}

/// Scheduled sync requires an interval; enabling without one is rejected so
/// `next_sync_at` can always be derived for enabled sources.
pub(crate) fn validate_enabled(enabled: bool, interval: Option<i64>) -> Result<(), ResponseError> {
  if enabled && interval.is_none() {
    return Err(ResponseError::BadRequest(
      "interval_seconds is required to enable scheduled sync".to_owned(),
    ));
  }
  Ok(())
}

/// Next due time after a successful sync: a plain interval step.
pub(crate) fn next_after_success(
  now: DateTime<Utc>, interval: Option<i64>,
) -> Option<DateTime<Utc>> {
  interval.map(|interval| now + chrono::Duration::seconds(interval))
}

/// Next due time after a failed sync: exponential backoff on the interval,
/// bounded by `2^BACKOFF_MAX_EXPONENT` interval steps.
pub(crate) fn next_after_failure(
  now: DateTime<Utc>, interval: Option<i64>, consecutive_failures: i32,
) -> Option<DateTime<Utc>> {
  let interval = interval?;
  let exponent = consecutive_failures.clamp(1, BACKOFF_MAX_EXPONENT as i32) as u32;
  let factor = BACKOFF_BASE.saturating_pow(exponent);
  let delay = interval.saturating_mul(factor).min(MAX_INTERVAL_SECONDS);
  Some(now + chrono::Duration::seconds(delay))
}

pub(crate) async fn list_sources(state: &GlobalState) -> Result<Vec<PublicSource>, ResponseError> {
  Ok(
    sync_source::get_list(&state.db.conn)
      .await?
      .into_iter()
      .map(PublicSource::from)
      .collect(),
  )
}

/// Baseline OID for binding an existing game: its current bucket HEAD.
pub(crate) async fn bucket_head_oid(
  state: &GlobalState, bucket_name: &str,
) -> Result<String, ResponseError> {
  let game_bucket = state.bucket.at(bucket_name).await?;
  Ok(game_bucket.git.get_head().await?)
}

pub(crate) async fn create_source(
  state: &GlobalState, repository_url: Url, credential: String, local_game_id: i64, enabled: bool,
  interval_seconds: Option<i64>, operator_id: i64,
) -> Result<PublicSource, ResponseError> {
  if credential.trim().is_empty() {
    return Err(ResponseError::BadRequest(
      "source credential is required".to_owned(),
    ));
  }
  validate_interval(interval_seconds)?;
  validate_enabled(enabled, interval_seconds)?;
  let game = game::get(&state.db.conn, local_game_id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("game".to_owned()))?;
  let bucket_name = game.bucket.clone().ok_or_else(|| {
    ResponseError::PreconditionFailed(
      "game bucket not found, the game cannot be synchronized".to_owned(),
    )
  })?;
  if sync_source::get_by_repository(&state.db.conn, repository_url.as_str())
    .await?
    .is_some()
  {
    return Err(ResponseError::Conflict(
      "this repository URL is already registered as a sync source".to_owned(),
    ));
  }
  if sync_source::get_by_game(&state.db.conn, local_game_id)
    .await?
    .is_some()
  {
    return Err(ResponseError::Conflict(
      "this game is already bound to a sync source".to_owned(),
    ));
  }
  let last_synced_oid = bucket_head_oid(state, &bucket_name).await?;
  let now = Utc::now();
  let source = sync_source::create(
    &state.db.conn,
    sync_source::Model {
      id: 0,
      repository_url: repository_url.to_string(),
      local_game_id,
      credential,
      enabled,
      interval_seconds,
      last_synced_oid: Some(last_synced_oid),
      next_sync_at: next_after_success(now, interval_seconds).filter(|_| enabled),
      last_attempt_at: None,
      last_success_at: None,
      last_status: sync_source::STATUS_IDLE.to_owned(),
      last_error: None,
      consecutive_failures: 0,
      created_at: now,
      updated_at: now,
    },
  )
  .await?;
  tracing::info!(
    source_id = source.id,
    game_id = local_game_id,
    operator_id,
    "registered a new sync source"
  );
  Ok(PublicSource::from(source))
}

/// Auto-registration after a successful one-shot import: the source starts
/// disabled and manual-only, with the imported HEAD as the sync baseline.
pub(crate) async fn register_imported_game(
  state: &GlobalState, game: &game::Model, repository_url: &Url, credential: &str,
) -> Result<sync_source::Model, ResponseError> {
  let bucket_name = game
    .bucket
    .clone()
    .ok_or_else(|| ResponseError::PreconditionFailed("game bucket not found".to_owned()))?;
  let last_synced_oid = bucket_head_oid(state, &bucket_name).await?;
  let now = Utc::now();
  let source = sync_source::create(
    &state.db.conn,
    sync_source::Model {
      id: 0,
      repository_url: repository_url.to_string(),
      local_game_id: game.id,
      credential: credential.to_owned(),
      enabled: false,
      interval_seconds: None,
      last_synced_oid: Some(last_synced_oid),
      next_sync_at: None,
      last_attempt_at: None,
      last_success_at: None,
      last_status: sync_source::STATUS_IDLE.to_owned(),
      last_error: None,
      consecutive_failures: 0,
      created_at: now,
      updated_at: now,
    },
  )
  .await?;
  tracing::info!(
    source_id = source.id,
    game_id = game.id,
    "registered the sync source for an imported game"
  );
  Ok(source)
}

pub(crate) async fn patch_source(
  state: &GlobalState, id: i64, credential: Option<String>, enabled: Option<bool>,
  interval_seconds: Option<Option<i64>>,
) -> Result<PublicSource, ResponseError> {
  let mut source = sync_source::get(&state.db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("sync source".to_owned()))?;
  if let Some(credential) = credential {
    if credential.trim().is_empty() {
      return Err(ResponseError::BadRequest(
        "source credential must not be empty".to_owned(),
      ));
    }
    source.credential = credential;
  }
  if let Some(interval) = interval_seconds {
    validate_interval(interval)?;
    source.interval_seconds = interval;
  }
  if let Some(enabled) = enabled {
    source.enabled = enabled;
  }
  validate_enabled(source.enabled, source.interval_seconds)?;
  let now = Utc::now();
  source.next_sync_at = if source.enabled {
    next_after_success(now, source.interval_seconds)
  } else {
    None
  };
  let source = sync_source::update(&state.db.conn, source).await?;
  Ok(PublicSource::from(source))
}

pub(crate) async fn delete_source(state: &GlobalState, id: i64) -> Result<(), ResponseError> {
  if sync_source::get(&state.db.conn, id).await?.is_none() {
    return Err(ResponseError::NotFound("sync source".to_owned()));
  }
  sync_source::delete(&state.db.conn, id).await?;
  tracing::info!(
    source_id = id,
    "deleted a sync source, the local game is kept"
  );
  Ok(())
}

#[cfg(test)]
mod tests {
  use chrono::{Duration, TimeZone, Utc};

  use super::{
    MAX_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, next_after_failure, next_after_success,
    validate_enabled, validate_interval,
  };
  use crate::traits::ResponseError;

  #[test]
  fn interval_must_be_within_bounds() {
    assert!(validate_interval(None).is_ok());
    assert!(validate_interval(Some(MIN_INTERVAL_SECONDS)).is_ok());
    assert!(validate_interval(Some(MAX_INTERVAL_SECONDS)).is_ok());
    assert!(matches!(
      validate_interval(Some(0)),
      Err(ResponseError::BadRequest(_))
    ));
    assert!(matches!(
      validate_interval(Some(-60)),
      Err(ResponseError::BadRequest(_))
    ));
    assert!(matches!(
      validate_interval(Some(MAX_INTERVAL_SECONDS + 1)),
      Err(ResponseError::BadRequest(_))
    ));
  }

  #[test]
  fn enabling_requires_an_interval() {
    assert!(validate_enabled(true, Some(60)).is_ok());
    assert!(validate_enabled(false, None).is_ok());
    assert!(matches!(
      validate_enabled(true, None),
      Err(ResponseError::BadRequest(_))
    ));
  }

  #[test]
  fn success_advances_by_the_plain_interval() {
    let now = Utc.timestamp_opt(1_700_000_000, 0).unwrap();
    assert_eq!(next_after_success(now, None), None);
    assert_eq!(
      next_after_success(now, Some(300)),
      Some(now + Duration::seconds(300))
    );
  }

  #[test]
  fn failure_backoff_is_bounded_and_exponential() {
    let now = Utc.timestamp_opt(1_700_000_000, 0).unwrap();
    assert_eq!(next_after_failure(now, None, 3), None);
    assert_eq!(
      next_after_failure(now, Some(300), 1),
      Some(now + Duration::seconds(600))
    );
    assert_eq!(
      next_after_failure(now, Some(300), 2),
      Some(now + Duration::seconds(1_200))
    );
    // the exponent is capped so the delay stops growing
    let capped = next_after_failure(now, Some(300), 50).unwrap();
    let direct = next_after_failure(now, Some(300), 5).unwrap();
    assert_eq!(capped, direct);
    assert_eq!(capped, now + Duration::seconds(300 * 32));
  }
}

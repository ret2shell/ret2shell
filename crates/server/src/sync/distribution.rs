use chrono::{DateTime, Utc};
use r2s_database::{distribution, game};
use serde::Serialize;

use crate::traits::{GlobalState, ResponseError};

/// Lower bound for a scheduled sync interval, one sync per minute at most.
pub(crate) const MIN_INTERVAL_SECONDS: i64 = 60;
/// Upper bound for a scheduled sync interval, one month at most.
pub(crate) const MAX_INTERVAL_SECONDS: i64 = 2_592_000;
/// Backoff multiplier base applied to consecutive failures.
const BACKOFF_BASE: i64 = 2;
/// Maximum backoff exponent, capping the delay independently of the interval.
const BACKOFF_MAX_EXPONENT: u32 = 5;

/// Sanitized distribution view: the credential never leaves the server.
#[derive(Serialize)]
pub(crate) struct PublicDistribution {
  pub id: i64,
  pub bucket_id: String,
  pub endpoint: String,
  pub head_ref: String,
  pub name: Option<String>,
  pub avatar: Option<String>,
  pub description: Option<String>,
  /// The community registry index this distribution came from; `None` marks
  /// a direct import.
  pub registry_url: Option<String>,
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
  pub managed_game_id: Option<i64>,
  pub managed_game_name: Option<String>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

impl From<distribution::Model> for PublicDistribution {
  fn from(distribution: distribution::Model) -> Self {
    Self {
      id: distribution.id,
      bucket_id: distribution.bucket_id,
      endpoint: distribution.endpoint,
      head_ref: distribution.head_ref,
      name: distribution.name,
      avatar: distribution.avatar,
      description: distribution.description,
      registry_url: distribution.registry_url,
      has_credential: !distribution.credential.is_empty(),
      enabled: distribution.enabled,
      interval_seconds: distribution.interval_seconds,
      last_synced_oid: distribution.last_synced_oid,
      next_sync_at: distribution.next_sync_at,
      last_attempt_at: distribution.last_attempt_at,
      last_success_at: distribution.last_success_at,
      last_status: distribution.last_status,
      last_error: distribution.last_error,
      consecutive_failures: distribution.consecutive_failures,
      managed_game_id: None,
      managed_game_name: None,
      created_at: distribution.created_at,
      updated_at: distribution.updated_at,
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
/// `next_sync_at` can always be derived for enabled distributions.
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

pub(crate) async fn list_distributions(
  state: &GlobalState,
) -> Result<Vec<PublicDistribution>, ResponseError> {
  let mut list = Vec::new();
  for model in distribution::get_list(&state.db.conn).await? {
    let managed = game::get_by_managed_distribution(&state.db.conn, model.id).await?;
    let mut view = PublicDistribution::from(model);
    if let Some(managed) = managed {
      view.managed_game_id = Some(managed.id);
      view.managed_game_name = Some(managed.name);
    }
    list.push(view);
  }
  Ok(list)
}

pub(crate) async fn patch_distribution(
  state: &GlobalState, id: i64, credential: Option<String>, enabled: Option<bool>,
  interval_seconds: Option<Option<i64>>,
) -> Result<PublicDistribution, ResponseError> {
  let mut model = distribution::get(&state.db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("distribution".to_owned()))?;
  if let Some(credential) = credential {
    if credential.trim().is_empty() {
      return Err(ResponseError::BadRequest(
        "source credential must not be empty".to_owned(),
      ));
    }
    model.credential = credential;
  }
  if let Some(interval) = interval_seconds {
    validate_interval(interval)?;
    model.interval_seconds = interval;
  }
  if let Some(enabled) = enabled {
    model.enabled = enabled;
  }
  validate_enabled(model.enabled, model.interval_seconds)?;
  let now = Utc::now();
  model.next_sync_at = if model.enabled {
    next_after_success(now, model.interval_seconds)
  } else {
    None
  };
  let model = distribution::update(&state.db.conn, model).await?;
  Ok(attach_managed_game(state, model).await)
}

async fn attach_managed_game(
  state: &GlobalState, model: distribution::Model,
) -> PublicDistribution {
  let mut view = PublicDistribution::from(model);
  match game::get_by_managed_distribution(&state.db.conn, view.id).await {
    Ok(Some(managed)) => {
      view.managed_game_id = Some(managed.id);
      view.managed_game_name = Some(managed.name);
    }
    Ok(None) => {}
    Err(error) => {
      tracing::warn!(distribution_id = view.id, error=?error, "failed to resolve the managed game");
    }
  }
  view
}

/// Deletes the distribution entirely. The managed game survives: the foreign
/// key clears `game.managed_distribution` and the historical jobs are removed
/// with the distribution.
pub(crate) async fn delete_distribution(state: &GlobalState, id: i64) -> Result<(), ResponseError> {
  distribution::get(&state.db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("distribution".to_owned()))?;
  distribution::delete(&state.db.conn, id).await?;
  tracing::info!(
    distribution_id = id,
    "deleted a distribution, the local game is kept unmanaged"
  );
  Ok(())
}

/// Unbinds the managed game: `managed_distribution` is cleared, local content
/// becomes editable again, and the distribution stops syncing. The
/// distribution row and its job history are kept.
pub(crate) async fn unbind_distribution(
  state: &GlobalState, id: i64,
) -> Result<PublicDistribution, ResponseError> {
  let model = distribution::get(&state.db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("distribution".to_owned()))?;
  let Some(managed) = game::get_by_managed_distribution(&state.db.conn, id).await? else {
    return Err(ResponseError::PreconditionFailed(
      "this distribution has no managed game".to_owned(),
    ));
  };
  let mut unmanaged = managed.clone();
  unmanaged.managed_distribution = None;
  game::update(&state.db.conn, unmanaged).await?;
  // the game row is served from the cache; without invalidation the managed
  // guard would keep rejecting edits until the entry expires
  invalidate_game_cache(state, managed.id).await?;
  let mut disabled = model.clone();
  disabled.enabled = false;
  disabled.next_sync_at = None;
  let disabled = distribution::update(&state.db.conn, disabled).await?;
  tracing::info!(
    distribution_id = id,
    game_id = managed.id,
    "unbound a distribution, the game content is locally editable again"
  );
  Ok(PublicDistribution::from(disabled))
}

/// Drops the cached game row so the next request sees the new management
/// state. Cache failures are logged, not fatal: the database is authoritative.
async fn invalidate_game_cache(state: &GlobalState, game_id: i64) -> Result<(), ResponseError> {
  if let Err(error) = state.cache.at("game").del(game_id).await {
    tracing::warn!(game_id, error=?error, "failed to invalidate the game cache");
  }
  Ok(())
}

/// Re-binds a game to an existing distribution. The bucket id must match, the
/// game must not be managed, and the local repository must sit exactly on the
/// distribution baseline, so re-binding can never silently overwrite local
/// content.
pub(crate) async fn bind_distribution(
  state: &GlobalState, id: i64, local_game_id: i64, operator_id: i64,
) -> Result<PublicDistribution, ResponseError> {
  let model = distribution::get(&state.db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("distribution".to_owned()))?;
  let mut managed = game::get(&state.db.conn, local_game_id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("game".to_owned()))?;
  if managed.managed_distribution.is_some() {
    return Err(ResponseError::Conflict(
      "this game is already managed by a distribution".to_owned(),
    ));
  }
  if game::get_by_managed_distribution(&state.db.conn, id)
    .await?
    .is_some()
  {
    return Err(ResponseError::Conflict(
      "this distribution already manages a game".to_owned(),
    ));
  }
  if managed.bucket.as_deref() != Some(model.bucket_id.as_str()) {
    return Err(ResponseError::Conflict(format!(
      "the game bucket {} does not match the distribution bucket id {}",
      managed.bucket.as_deref().unwrap_or("<none>"),
      model.bucket_id
    )));
  }
  let Some(baseline) = model.last_synced_oid.clone() else {
    return Err(ResponseError::PreconditionFailed(
      "the distribution has no baseline revision".to_owned(),
    ));
  };
  let game_bucket = state.bucket.at(&model.bucket_id).await?;
  let head = game_bucket.git.get_head().await?;
  if !head.eq_ignore_ascii_case(&baseline) {
    return Err(ResponseError::Conflict(
      "the local repository HEAD diverged from the distribution baseline; \
       re-import or repair the repository before binding"
        .to_owned(),
    ));
  }
  managed.managed_distribution = Some(id);
  game::update(&state.db.conn, managed).await?;
  invalidate_game_cache(state, local_game_id).await?;
  tracing::info!(
    distribution_id = id,
    game_id = local_game_id,
    operator_id,
    "bound a game to a distribution"
  );
  Ok(attach_managed_game(state, model).await)
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

use std::sync::{Arc, Mutex};

use chrono::Utc;
use r2s_database::{distribution, game, sync_job};
use sea_orm::{ActiveValue, ColumnTrait, EntityTrait, QueryFilter};
use tokio::sync::mpsc;
use tower_http::request_id::RequestId;

use crate::{
  routes::game::{hook::GitHookFormatter, repo_sync::StreamLogger},
  traits::{GlobalState, ResponseError},
};

/// Upper bound of the persisted job log, roughly one mebibyte.
pub(crate) const MAX_LOG_BYTES: usize = 1024 * 1024;
/// Head portion kept when the log is truncated; the tail keeps the outcome.
const LOG_HEAD_BYTES: usize = 32 * 1024;
/// Wall-clock budget of a single incremental sync.
pub(crate) const JOB_TIMEOUT_SECONDS: u64 = 600;

/// Keeps the first and last portions of an oversized log so both the context
/// header and the failure tail survive persistence.
pub(crate) fn truncate_log(log: &str) -> String {
  if log.len() <= MAX_LOG_BYTES {
    return log.to_owned();
  }
  let head_end = floor_char_boundary(log, LOG_HEAD_BYTES);
  let tail_start = ceil_char_boundary(
    log,
    log.len().saturating_sub(MAX_LOG_BYTES - LOG_HEAD_BYTES),
  );
  format!(
    "{}\n[... log truncated, {} bytes omitted ...]\n{}",
    &log[..head_end],
    log.len(),
    &log[tail_start..]
  )
}

fn floor_char_boundary(input: &str, index: usize) -> usize {
  let mut index = index.min(input.len());
  while index > 0 && !input.is_char_boundary(index) {
    index -= 1;
  }
  index
}

fn ceil_char_boundary(input: &str, index: usize) -> usize {
  let mut index = index.min(input.len());
  while index < input.len() && !input.is_char_boundary(index) {
    index += 1;
  }
  index
}

/// Replaces every occurrence of the source credential before a message or a
/// log is persisted next to the job.
pub(crate) fn redact_credential(input: &str, credential: &str) -> String {
  if credential.is_empty() {
    input.to_owned()
  } else {
    input.replace(credential, "<redacted>")
  }
}

/// Collects the sync log of a job in memory while it runs. The log is
/// persisted once at job completion, bounded by [`MAX_LOG_BYTES`].
#[derive(Clone, Default)]
pub(crate) struct JobLogger {
  buffer: Arc<Mutex<String>>,
  drain: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl JobLogger {
  pub(crate) fn new() -> Self {
    Self::default()
  }

  fn append(&self, line: &str) {
    let mut buffer = self.buffer.lock().expect("job log mutex poisoned");
    buffer.push_str(line);
    if !line.ends_with('\n') {
      buffer.push('\n');
    }
  }

  pub(crate) fn snapshot(&self) -> String {
    self.buffer.lock().expect("job log mutex poisoned").clone()
  }

  /// Waits for the drain task of [`JobLogger::bridge`] to flush every
  /// pending line, then returns the collected log. The bridged
  /// [`StreamLogger`] must already be dropped.
  pub(crate) async fn finalize(&self) -> String {
    let handle = self.drain.lock().expect("job log mutex poisoned").take();
    if let Some(handle) = handle {
      let _ = handle.await;
    }
    self.snapshot()
  }

  /// Bridges the shared [`StreamLogger`] used by the materialization core
  /// into this collector: the drain task keeps the buffer updated while the
  /// sync runs, and exits once the sender side is dropped.
  pub(crate) fn bridge(&self) -> StreamLogger {
    let (tx, mut rx) = mpsc::channel::<Result<axum::body::Bytes, std::io::Error>>(64);
    let logger = JobLogger::clone(self);
    let handle = tokio::spawn(async move {
      while let Some(chunk) = rx.recv().await {
        if let Ok(chunk) = chunk {
          logger.append(&String::from_utf8_lossy(&chunk));
        }
      }
    });
    *self.drain.lock().expect("job log mutex poisoned") = Some(handle);
    StreamLogger::new(tx, GitHookFormatter::new(false))
  }
}

/// Creates a queued job for the distribution. A distribution keeps at most
/// one queued or running job, so a concurrent trigger is rejected instead of
/// queued up, and a distribution without a managed game cannot sync at all.
pub(crate) async fn enqueue_job(
  state: &GlobalState, distribution_id: i64, trigger: &str, trace: Option<&RequestId>,
) -> Result<sync_job::Model, ResponseError> {
  let model = distribution::get(&state.db.conn, distribution_id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("distribution".to_owned()))?;
  let managed = game::get_by_managed_distribution(&state.db.conn, distribution_id)
    .await?
    .ok_or_else(|| {
      ResponseError::PreconditionFailed(
        "this distribution has no managed game; bind a game before syncing".to_owned(),
      )
    })?;
  if sync_job::get_active_by_distribution(&state.db.conn, distribution_id)
    .await?
    .is_some()
  {
    return Err(ResponseError::Conflict(
      "this distribution already has a queued or running job".to_owned(),
    ));
  }
  let trace_id = trace
    .and_then(|trace| trace.header_value().to_str().ok())
    .unwrap_or("UNKNOWN")
    .to_owned();
  let job = sync_job::create(
    &state.db.conn,
    sync_job::Model {
      id: 0,
      distribution_id,
      local_game_id: managed.id,
      trigger: trigger.to_owned(),
      status: sync_job::STATUS_QUEUED.to_owned(),
      old_oid: model.last_synced_oid.clone(),
      new_oid: None,
      expected_head: None,
      trace_id,
      error_code: None,
      error_message: None,
      log: String::new(),
      created_at: Utc::now(),
      started_at: None,
      finished_at: None,
    },
  )
  .await?;
  Ok(job)
}

/// Moves a queued job to `running`, guarding the state machine against a
/// double claim: only the transition from `queued` wins.
pub(crate) async fn claim_job(
  state: &GlobalState, job_id: i64,
) -> Result<Option<sync_job::Model>, ResponseError> {
  let patch = sync_job::ActiveModel {
    status: ActiveValue::Set(sync_job::STATUS_RUNNING.to_owned()),
    started_at: ActiveValue::Set(Some(Utc::now())),
    ..Default::default()
  };
  let result = sync_job::Entity::update_many()
    .set(patch)
    .filter(sync_job::Column::Id.eq(job_id))
    .filter(sync_job::Column::Status.eq(sync_job::STATUS_QUEUED))
    .exec(&state.db.conn)
    .await?;
  if result.rows_affected == 0 {
    return Ok(None);
  }
  Ok(sync_job::get(&state.db.conn, job_id).await?)
}

/// Pins the admission head of this run on the job row for audit, before any
/// repository content is touched.
async fn set_expected_head(
  state: &GlobalState, job_id: i64, expected_head: &str,
) -> Result<(), ResponseError> {
  let patch = sync_job::ActiveModel {
    expected_head: ActiveValue::Set(Some(expected_head.to_owned())),
    ..Default::default()
  };
  sync_job::Entity::update_many()
    .set(patch)
    .filter(sync_job::Column::Id.eq(job_id))
    .exec(&state.db.conn)
    .await?;
  Ok(())
}

/// Terminal fields written when a job settles.
pub(crate) struct JobOutcome {
  pub(crate) status: &'static str,
  pub(crate) error_code: Option<String>,
  pub(crate) error_message: Option<String>,
  pub(crate) new_oid: Option<String>,
  pub(crate) expected_head: Option<String>,
  pub(crate) log: String,
}

/// Moves a running job to its terminal state. Only the transition from
/// `running` is accepted so a finished job can never be rewritten.
pub(crate) async fn finish_job(
  state: &GlobalState, job_id: i64, outcome: JobOutcome,
) -> Result<(), ResponseError> {
  let patch = sync_job::ActiveModel {
    status: ActiveValue::Set(outcome.status.to_owned()),
    error_code: ActiveValue::Set(outcome.error_code),
    error_message: ActiveValue::Set(outcome.error_message),
    new_oid: ActiveValue::Set(outcome.new_oid),
    expected_head: ActiveValue::Set(outcome.expected_head),
    log: ActiveValue::Set(outcome.log),
    finished_at: ActiveValue::Set(Some(Utc::now())),
    ..Default::default()
  };
  let result = sync_job::Entity::update_many()
    .set(patch)
    .filter(sync_job::Column::Id.eq(job_id))
    .filter(sync_job::Column::Status.eq(sync_job::STATUS_RUNNING))
    .exec(&state.db.conn)
    .await?;
  if result.rows_affected == 0 {
    tracing::error!(
      job_id,
      "a sync job left the running state before it was finalized"
    );
  }
  Ok(())
}

/// Global single-slot guard: scheduled and manual jobs never execute at the
/// same time, matching the low-concurrency default of the sync design.
static SYNC_EXECUTION_SLOT: std::sync::OnceLock<tokio::sync::Mutex<()>> =
  std::sync::OnceLock::new();

fn execution_slot() -> &'static tokio::sync::Mutex<()> {
  SYNC_EXECUTION_SLOT.get_or_init(|| tokio::sync::Mutex::new(()))
}

/// The sync body of a job run: discovers the current source admission head,
/// pins it on the job, and executes the incremental sync against it. The
/// discovery result travels as the pinned head so a mirror swap between
/// discovery and fetch is rejected by the admission check. The pinned head is
/// returned even when the sync fails, keeping the audit trail truthful.
async fn run_sync_body(
  state: &GlobalState, model: &distribution::Model, job: &sync_job::Model, logger: &StreamLogger,
) -> (
  Option<String>,
  Result<crate::sync::update::UpdateReport, crate::sync::update::UpdateError>,
) {
  let endpoint = match url::Url::parse(&model.endpoint) {
    Ok(endpoint) => endpoint,
    Err(error) => {
      return (
        None,
        Err(crate::sync::update::UpdateError::Internal(format!(
          "the stored distribution endpoint is no longer valid: {error}"
        ))),
      );
    }
  };
  let discovered = match crate::sync::discover::discover(&endpoint, &model.credential).await {
    Ok(discovered) => discovered,
    Err(message) => {
      return (
        None,
        Err(crate::sync::update::UpdateError::DiscoverFailed(
          crate::sync::job::redact_credential(&message, &model.credential),
        )),
      );
    }
  };
  let pinned_head = discovered.descriptor.head.clone();
  if let Err(error) = set_expected_head(state, job.id, &pinned_head).await {
    tracing::error!(job_id = job.id, error=%error, "failed to pin the expected head");
  }
  logger
    .info(format!(
      "Discovered upstream bucket {} at HEAD {}.",
      discovered.descriptor.bucket_id, discovered.descriptor.head
    ))
    .await;
  let source_registry = discovered
    .descriptor
    .registry
    .as_ref()
    .map(|registry| registry.registry_config());
  let result = crate::sync::update::execute_update(
    state,
    model,
    &discovered.repository_url,
    &pinned_head,
    source_registry.as_ref(),
    &job.trace_id,
    logger,
  )
  .await;
  (Some(pinned_head), result)
}

/// Claims and runs one job to its terminal state, then records the outcome on
/// both the job and its distribution. Shared by the manual API trigger and
/// the scheduled worker.
pub(crate) async fn run_job(state: GlobalState, distribution_id: i64, job_id: i64) {
  let job = match claim_job(&state, job_id).await {
    Ok(Some(job)) => job,
    Ok(None) => {
      tracing::warn!(job_id, "sync job was already claimed, skipping");
      return;
    }
    Err(error) => {
      tracing::error!(job_id, error = %error, "failed to claim the sync job");
      return;
    }
  };
  let Some(model) = distribution::get(&state.db.conn, distribution_id)
    .await
    .ok()
    .flatten()
  else {
    tracing::error!(
      job_id,
      distribution_id,
      "distribution disappeared before the job ran"
    );
    return;
  };
  let collector = JobLogger::new();
  let logger = collector.bridge();
  logger.header("Ret2Shell instance sync").await;
  logger.info(format!("Game id: {}", job.local_game_id)).await;
  logger
    .info(format!(
      "Source : {} (bucket {})",
      model.endpoint, model.bucket_id
    ))
    .await;
  let mut syncing = model.clone();
  syncing.last_status = distribution::STATUS_SYNCING.to_owned();
  syncing.last_attempt_at = Some(Utc::now());
  if let Err(error) = distribution::update(&state.db.conn, syncing).await {
    tracing::error!(job_id, error = %error, "failed to mark the distribution as syncing");
  }

  // the execution slot serializes concurrent triggers; the timeout bounds
  // discovery and the sync itself
  let slot = execution_slot().lock().await;
  let result = tokio::time::timeout(
    std::time::Duration::from_secs(JOB_TIMEOUT_SECONDS),
    run_sync_body(&state, &model, &job, &logger),
  )
  .await;
  let (expected_head, outcome) = match result {
    Ok((pinned_head, outcome)) => (pinned_head, outcome),
    Err(_) => (None, Err(crate::sync::update::UpdateError::Timeout)),
  };
  drop(slot);

  match &outcome {
    Ok(_) => {
      logger
        .success("ret2shell instance sync completed successfully")
        .await
    }
    Err(update_error) => {
      logger
        .error(format!(
          "Sync failed: [{}] {}",
          update_error.code(),
          update_error.message()
        ))
        .await
    }
  }
  drop(logger);
  let log = truncate_log(&redact_credential(
    &collector.finalize().await,
    &model.credential,
  ));
  let now = Utc::now();
  let mut updated = model.clone();
  match outcome {
    Ok(report) => {
      if let Err(error) = finish_job(
        &state,
        job_id,
        JobOutcome {
          status: sync_job::STATUS_SUCCEEDED,
          error_code: None,
          error_message: None,
          new_oid: Some(report.new_oid.clone()),
          expected_head,
          log,
        },
      )
      .await
      {
        tracing::error!(job_id, error = %error, "failed to record the sync job success");
      }
      // the materialization transaction already persisted these for applied
      // updates; writing them again covers the no-op path and late restarts
      updated.last_synced_oid = Some(report.new_oid.clone());
      updated.head_ref = report.new_oid;
      updated.last_attempt_at = Some(now);
      updated.last_success_at = Some(now);
      updated.last_status = distribution::STATUS_SUCCEEDED.to_owned();
      updated.last_error = None;
      updated.consecutive_failures = 0;
      updated.next_sync_at = if updated.enabled {
        crate::sync::distribution::next_after_success(now, updated.interval_seconds)
      } else {
        None
      };
    }
    Err(update_error) => {
      if let Err(error) = finish_job(
        &state,
        job_id,
        JobOutcome {
          status: sync_job::STATUS_FAILED,
          error_code: Some(update_error.code().to_owned()),
          error_message: Some(redact_credential(
            &update_error.message(),
            &model.credential,
          )),
          new_oid: None,
          expected_head,
          log,
        },
      )
      .await
      {
        tracing::error!(job_id, error = %error, "failed to record the sync job failure");
      }
      updated.last_attempt_at = Some(now);
      updated.last_status = distribution::STATUS_FAILED.to_owned();
      updated.last_error = Some(redact_credential(
        &update_error.message(),
        &model.credential,
      ));
      updated.consecutive_failures += 1;
      updated.next_sync_at = crate::sync::distribution::next_after_failure(
        now,
        updated.interval_seconds,
        updated.consecutive_failures,
      );
    }
  }
  if let Err(error) = distribution::update(&state.db.conn, updated).await {
    tracing::error!(job_id, error = %error, "failed to record the distribution outcome");
  }
}

#[cfg(test)]
mod tests {
  use super::{MAX_LOG_BYTES, redact_credential, truncate_log};

  #[test]
  fn short_logs_pass_through_untouched() {
    assert_eq!(truncate_log("hello\n"), "hello\n");
    assert_eq!(truncate_log(""), "");
  }

  #[test]
  fn oversized_logs_keep_head_and_tail() {
    let log = format!("{}\n{}\n", "H".repeat(600), "T".repeat(MAX_LOG_BYTES));
    let truncated = truncate_log(&log);
    assert!(truncated.len() <= MAX_LOG_BYTES + 128);
    assert!(truncated.starts_with('H'));
    assert!(truncated.ends_with("T\n"));
    assert!(truncated.contains("log truncated"));
  }

  #[test]
  fn truncation_respects_utf8_boundaries() {
    let log = "界".repeat(MAX_LOG_BYTES / 3 + 8);
    let truncated = truncate_log(&log);
    assert!(truncated.starts_with('界'));
    assert!(truncated.ends_with('界'));
  }

  #[test]
  fn credentials_are_redacted_from_persisted_text() {
    assert_eq!(
      redact_credential("Bearer secret-token failed", "secret-token"),
      "Bearer <redacted> failed"
    );
    assert_eq!(
      redact_credential("no credential here", ""),
      "no credential here"
    );
  }
}

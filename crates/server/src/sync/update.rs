use r2s_bucket::git::{Git, SYNC_CANDIDATE_REF};
use r2s_database::{game, sync_source};
use sea_orm::TransactionTrait;
use tracing::{error, info, warn};
use url::Url;

use crate::{
  routes::game::repo_sync::{
    StreamLogger, SyncOutcome, finalize_repository_sync, synchronize_repository_import,
  },
  traits::GlobalState,
};

/// Outcome of an incremental sync run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum SyncPlan {
  /// The upstream candidate matches the baseline, nothing to do.
  NoOp { oid: String },
  /// The upstream candidate is a strict descendant of the baseline.
  FastForward { old_oid: String, new_oid: String },
}

/// Stable error codes persisted in `sync_job.error_code` and surfaced to the
/// frontend verbatim.
#[derive(Clone, Debug)]
pub(crate) enum UpdateError {
  LocalDiverged { head: String, expected: String },
  UpstreamDiverged { old_oid: String, new_oid: String },
  GameMissing,
  GameVisible,
  BucketMissing,
  BucketLocked,
  MissingBaseline,
  FetchFailed(String),
  CandidateUnresolved(String),
  Validation(String),
  Materialization(String),
  RollbackFailed { cause: String, rollback: String },
  Timeout,
  Internal(String),
}

impl UpdateError {
  pub(crate) fn code(&self) -> &'static str {
    match self {
      Self::LocalDiverged { .. } => "local_diverged",
      Self::UpstreamDiverged { .. } => "upstream_diverged",
      Self::GameMissing => "game_missing",
      Self::GameVisible => "game_visible",
      Self::BucketMissing => "bucket_missing",
      Self::BucketLocked => "bucket_locked",
      Self::MissingBaseline => "missing_baseline",
      Self::FetchFailed(_) => "fetch_failed",
      Self::CandidateUnresolved(_) => "candidate_unresolved",
      Self::Validation(_) => "validation_failed",
      Self::Materialization(_) => "materialization_failed",
      Self::RollbackFailed { .. } => "rollback_failed",
      Self::Timeout => "timeout",
      Self::Internal(_) => "internal_error",
    }
  }

  pub(crate) fn message(&self) -> String {
    match self {
      Self::LocalDiverged { head, expected } => format!(
        "the local repository HEAD `{head}` no longer matches the last synced revision `{expected}`; \
         fix the local repository, pause the source, or unbind it to maintain the game locally"
      ),
      Self::UpstreamDiverged { old_oid, new_oid } => format!(
        "the upstream repository rewrote history: `{new_oid}` is not a descendant of `{old_oid}`; \
         the source must be repaired before syncing again"
      ),
      Self::GameMissing => "the local game bound to this sync source no longer exists".to_owned(),
      Self::GameVisible => {
        "the local game is visible; syncing into a published game is not allowed".to_owned()
      }
      Self::BucketMissing => "the local game has no repository bucket".to_owned(),
      Self::BucketLocked => {
        "another repository write operation is already in progress for this game".to_owned()
      }
      Self::MissingBaseline => {
        "the sync source has no baseline revision; re-register the source".to_owned()
      }
      Self::FetchFailed(message) => format!("failed to fetch the source repository: {message}"),
      Self::CandidateUnresolved(message) => {
        format!("failed to resolve the fetched candidate revision: {message}")
      }
      Self::Validation(message) => format!("the upstream revision was rejected: {message}"),
      Self::Materialization(message) => {
        format!("failed to materialize the upstream revision: {message}")
      }
      Self::RollbackFailed { cause, rollback } => format!(
        "synchronization failed ({cause}) and restoring the local repository also failed ({rollback}); \
         the repository needs manual inspection"
      ),
      Self::Timeout => format!(
        "the sync exceeded the {}-second budget and was cancelled",
        crate::sync::job::JOB_TIMEOUT_SECONDS
      ),
      Self::Internal(message) => message.clone(),
    }
  }
}

fn internal(error: impl std::fmt::Display) -> UpdateError {
  UpdateError::Internal(error.to_string())
}

fn head_branch(head_ref: &str) -> Result<&str, UpdateError> {
  head_ref
    .strip_prefix("refs/heads/")
    .filter(|branch| !branch.is_empty())
    .ok_or_else(|| {
      UpdateError::Internal(format!("the repository HEAD `{head_ref}` is not a branch"))
    })
}

/// Derives the sync plan from the local repository state. The candidate ref
/// must already be populated by a fetch. Order matters: the local divergence
/// check runs before anything else, a matching candidate is a successful
/// no-op, and only a strict descendant may be applied.
pub(crate) async fn plan_update(git: &Git, last_oid: &str) -> Result<SyncPlan, UpdateError> {
  let head = git.get_head().await.map_err(internal)?;
  if head != last_oid {
    return Err(UpdateError::LocalDiverged {
      head,
      expected: last_oid.to_owned(),
    });
  }
  let candidate = git
    .resolve_ref(SYNC_CANDIDATE_REF)
    .await
    .map_err(|error| UpdateError::CandidateUnresolved(error.to_string()))?;
  if candidate == last_oid {
    return Ok(SyncPlan::NoOp { oid: candidate });
  }
  if !git
    .is_ancestor(last_oid, &candidate)
    .await
    .map_err(internal)?
  {
    return Err(UpdateError::UpstreamDiverged {
      old_oid: last_oid.to_owned(),
      new_oid: candidate,
    });
  }
  Ok(SyncPlan::FastForward {
    old_oid: last_oid.to_owned(),
    new_oid: candidate,
  })
}

/// Restores the branch ref with a compare-and-swap update and resets the
/// working tree back to the previous revision.
async fn restore_repository(
  git: &Git, head_ref: &str, old_oid: &str, new_oid: &str,
) -> Result<(), String> {
  git
    .update_ref(head_ref, old_oid, new_oid)
    .await
    .map_err(|error| error.to_string())?;
  git
    .reset_hard(old_oid)
    .await
    .map_err(|error| error.to_string())
}

pub(crate) struct UpdateReport {
  pub old_oid: String,
  pub new_oid: String,
  pub applied: bool,
}

/// Runs one incremental sync of a source. On any failure the database, the
/// branch ref and the working tree are restored, leaving no half-synchronized
/// state behind.
pub(crate) async fn execute_update(
  state: &GlobalState, source: &sync_source::Model, trace_id: &str, logger: &StreamLogger,
) -> Result<UpdateReport, UpdateError> {
  let game = game::get(&state.db.conn, source.local_game_id)
    .await
    .map_err(internal)?
    .ok_or(UpdateError::GameMissing)?;
  if !game.hidden {
    return Err(UpdateError::GameVisible);
  }
  let bucket_name = game.bucket.clone().ok_or(UpdateError::BucketMissing)?;
  let repo_lock = state.bucket.lock(&bucket_name).map_err(|bucket_error| {
    if matches!(bucket_error, r2s_bucket::BucketError::LockError) {
      UpdateError::BucketLocked
    } else {
      internal(bucket_error)
    }
  })?;
  let game_bucket = state.bucket.at(&bucket_name).await.map_err(internal)?;
  let last_oid = source
    .last_synced_oid
    .clone()
    .ok_or(UpdateError::MissingBaseline)?;
  let head_ref = game_bucket.git.get_head_ref().await.map_err(internal)?;
  let branch = head_branch(&head_ref)?.to_owned();

  logger
    .info(format!(
      "Fetching source repository from {}...",
      source.repository_url
    ))
    .await;
  game_bucket
    .git
    .fetch(&source.repository_url, &branch, Some(&source.credential))
    .await
    .map_err(|error| {
      UpdateError::FetchFailed(crate::sync::job::redact_credential(
        &error.to_string(),
        &source.credential,
      ))
    })?;

  let plan = plan_update(&game_bucket.git, &last_oid).await?;
  let report = match plan {
    SyncPlan::NoOp { oid } => {
      logger
        .info("Upstream revision matches the local baseline, nothing to do.")
        .await;
      UpdateReport {
        old_oid: oid.clone(),
        new_oid: oid,
        applied: false,
      }
    }
    SyncPlan::FastForward { old_oid, new_oid } => {
      game_bucket
        .git
        .validate_sync_tree(&new_oid)
        .await
        .map_err(|error| UpdateError::Validation(error.to_string()))?;
      logger
        .info(format!(
          "Applying fast-forward update {} -> {}...",
          &old_oid[..old_oid.len().min(8)],
          &new_oid[..new_oid.len().min(8)]
        ))
        .await;
      game_bucket
        .git
        .update_ref(&head_ref, &new_oid, &old_oid)
        .await
        .map_err(|error| UpdateError::Materialization(error.to_string()))?;
      if let Err(error) = game_bucket.git.reset_hard(&new_oid).await {
        let rollback = restore_repository(&game_bucket.git, &head_ref, &old_oid, &new_oid)
          .await
          .err()
          .map(|rollback_error| rollback_error.to_string())
          .unwrap_or_default();
        if rollback.is_empty() {
          return Err(UpdateError::Materialization(error.to_string()));
        }
        return Err(UpdateError::RollbackFailed {
          cause: error.to_string(),
          rollback,
        });
      }
      let diff = game_bucket
        .git
        .diff_name_status(&old_oid, &new_oid)
        .await
        .map_err(internal)?;
      logger
        .info(format!("Detected {} changed path(s).", diff.len()))
        .await;

      let txn = state.db.conn.begin().await.map_err(internal)?;
      // the block only borrows the transaction: `DatabaseTransaction::commit`
      // consumes it, so the commit happens after the block to keep the
      // repository rollback path reachable
      let materialize = async {
        let repository_url = Url::parse(&source.repository_url).map_err(|error| {
          UpdateError::Validation(format!(
            "the stored repository URL is no longer valid: {error}"
          ))
        })?;
        let operator_id = game.admins.0.first().copied().unwrap_or_default();
        crate::sync::media::synchronize_media(
          state,
          &txn,
          &repository_url,
          &game_bucket,
          &source.credential,
          operator_id,
          logger,
        )
        .await
        .map_err(|message| {
          UpdateError::Materialization(crate::sync::job::redact_credential(
            &message,
            &source.credential,
          ))
        })?;
        let outcome =
          synchronize_repository_import(state, &txn, &game, &game_bucket, &diff, logger)
            .await
            .map_err(|sync_error| {
              UpdateError::Materialization(crate::sync::job::redact_credential(
                &sync_error.to_string(),
                &source.credential,
              ))
            })?;
        let now = chrono::Utc::now();
        sync_source::update(
          &txn,
          sync_source::Model {
            last_synced_oid: Some(new_oid.clone()),
            last_attempt_at: Some(now),
            last_success_at: Some(now),
            last_status: sync_source::STATUS_SUCCEEDED.to_owned(),
            last_error: None,
            consecutive_failures: 0,
            next_sync_at: if source.enabled {
              crate::sync::source::next_after_success(now, source.interval_seconds)
            } else {
              None
            },
            ..source.clone()
          },
        )
        .await
        .map_err(internal)?;
        Ok::<SyncOutcome, UpdateError>(outcome)
      }
      .await;
      let outcome = match materialize {
        Ok(outcome) => outcome,
        Err(update_error) => {
          // dropping the transaction rolls it back
          match restore_repository(&game_bucket.git, &head_ref, &old_oid, &new_oid).await {
            Ok(()) => {
              logger.error("Repository rollback completed.").await;
              return Err(update_error);
            }
            Err(rollback_error) => {
              error!(
                source_id = source.id,
                game_id = game.id,
                error = %rollback_error,
                "repository rollback after a failed incremental sync failed"
              );
              return Err(UpdateError::RollbackFailed {
                cause: update_error.message(),
                rollback: rollback_error,
              });
            }
          }
        }
      };
      if let Err(commit_error) = txn.commit().await {
        // the database transaction rolls itself back on drop; the repository
        // must be restored to the baseline as well
        let cause = format!("failed to commit the sync transaction: {commit_error}");
        match restore_repository(&game_bucket.git, &head_ref, &old_oid, &new_oid).await {
          Ok(()) => {
            logger.error("Repository rollback completed.").await;
            return Err(UpdateError::Materialization(
              crate::sync::job::redact_credential(&cause, &source.credential),
            ));
          }
          Err(rollback_error) => {
            error!(
              source_id = source.id,
              game_id = game.id,
              error = %rollback_error,
              "repository rollback after a failed commit failed"
            );
            return Err(UpdateError::RollbackFailed {
              cause,
              rollback: rollback_error,
            });
          }
        }
      }
      if let Err(finalize_error) =
        finalize_repository_sync(state, &game, outcome, &bucket_name, trace_id, logger).await
      {
        // the database and repository are already consistent; late side
        // effects are logged and retried by the next sync instead of failing
        // the job after a successful commit
        warn!(
          source_id = source.id,
          game_id = game.id,
          error = %finalize_error,
          "failed to finalize the incremental sync side effects"
        );
        logger
          .warn(format!(
            "Failed to refresh caches after the update: {finalize_error}"
          ))
          .await;
      }
      UpdateReport {
        old_oid,
        new_oid,
        applied: true,
      }
    }
  };
  drop(repo_lock);
  info!(
    source_id = source.id,
    game_id = game.id,
    from = %report.old_oid,
    to = %report.new_oid,
    applied = report.applied,
    "incremental sync finished"
  );
  Ok(report)
}

#[cfg(all(test, unix))]
mod tests {
  use std::{
    path::Path,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
  };

  use r2s_bucket::git::{Git, SYNC_CANDIDATE_REF};

  use super::{SyncPlan, UpdateError, plan_update};

  fn temp_repo(name: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock before unix epoch")
      .as_nanos();
    std::env::temp_dir().join(format!(
      "ret2shell-sync-plan-{name}-{}-{nanos}",
      std::process::id()
    ))
  }

  fn run_git(repo: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
      .arg("-C")
      .arg(repo)
      .args(args)
      .output()
      .expect("run git command");
    assert!(output.status.success(), "git command failed: {args:?}");
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
  }

  fn commit(repo: &Path, message: &str) -> String {
    run_git(
      repo,
      &[
        "-c",
        "user.name=Tester",
        "-c",
        "user.email=tester@example.com",
        "commit",
        "--allow-empty",
        "-m",
        message,
      ],
    );
    run_git(repo, &["rev-parse", "HEAD"])
  }

  async fn setup(name: &str) -> (std::path::PathBuf, Git, String) {
    let repo = temp_repo(name);
    std::fs::create_dir_all(&repo).unwrap();
    run_git(&repo, &["init", "--initial-branch=master"]);
    let first = commit(&repo, "first");
    let git = Git::try_open(&repo).await.unwrap();
    (repo, git, first)
  }

  fn set_candidate(repo: &Path, oid: &str) {
    run_git(repo, &["update-ref", SYNC_CANDIDATE_REF, oid]);
  }

  fn cleanup(repo: &Path) {
    std::fs::remove_dir_all(repo).ok();
  }

  #[tokio::test]
  async fn plan_rejects_a_locally_diverged_repository() {
    let (repo, git, first) = setup("local-diverged").await;
    let second = commit(&repo, "second");
    let error = plan_update(&git, &first).await.unwrap_err();
    assert!(matches!(
      &error,
      UpdateError::LocalDiverged { head, expected }
      if *head == second && *expected == first
    ));
    assert_eq!(error.code(), "local_diverged");
    cleanup(&repo);
  }

  #[tokio::test]
  async fn plan_is_a_noop_when_the_candidate_matches_the_baseline() {
    let (repo, git, first) = setup("noop").await;
    set_candidate(&repo, &first);
    let plan = plan_update(&git, &first).await.unwrap();
    assert_eq!(plan, SyncPlan::NoOp { oid: first.clone() });
    cleanup(&repo);
  }

  #[tokio::test]
  async fn plan_rejects_an_upstream_history_rewrite() {
    let (repo, git, first) = setup("upstream-diverged").await;
    run_git(&repo, &["checkout", "--orphan", "rewritten"]);
    let unrelated = commit(&repo, "unrelated root");
    run_git(&repo, &["checkout", "master"]);
    set_candidate(&repo, &unrelated);
    let error = plan_update(&git, &first).await.unwrap_err();
    assert!(matches!(
      &error,
      UpdateError::UpstreamDiverged { old_oid, new_oid }
      if *old_oid == first && *new_oid == unrelated
    ));
    assert_eq!(error.code(), "upstream_diverged");
    cleanup(&repo);
  }

  #[tokio::test]
  async fn plan_accepts_a_fast_forward_candidate() {
    let (repo, git, first) = setup("fast-forward").await;
    // the new upstream commit is created on a side branch so the local HEAD
    // stays on the baseline revision, like a real pre-sync repository
    run_git(&repo, &["checkout", "-q", "-b", "upstream-next"]);
    let second = commit(&repo, "second");
    run_git(&repo, &["checkout", "-q", "master"]);
    set_candidate(&repo, &second);
    let plan = plan_update(&git, &first).await.unwrap();
    assert_eq!(
      plan,
      SyncPlan::FastForward {
        old_oid: first,
        new_oid: second
      }
    );
    cleanup(&repo);
  }

  #[tokio::test]
  async fn plan_requires_a_resolved_candidate() {
    let (repo, git, first) = setup("missing-candidate").await;
    let error = plan_update(&git, &first).await.unwrap_err();
    assert!(matches!(error, UpdateError::CandidateUnresolved(_)));
    assert_eq!(error.code(), "candidate_unresolved");
    cleanup(&repo);
  }
}

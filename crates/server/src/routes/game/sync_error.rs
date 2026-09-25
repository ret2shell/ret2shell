//! Errors of the git push synchronization pipeline.
//!
//! `Display` output is rendered into the push log as
//! `Synchronization failed: {err}`, so every message is part of the
//! user-facing contract and must stay stable.

use std::io;

use r2s_bucket::BucketError;
use r2s_database::DbErr;
use r2s_engine::EngineError;
use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum SyncError {
  #[error("game bucket `{0}` no longer exists")]
  GameBucketMissing(String),
  #[error("git hook session does not match the target game")]
  SessionMismatch,
  #[error("The repository is read-only while the game is visible to players.")]
  ReadOnlyRepository,
  #[error("pushing multiple refs is not supported")]
  MultipleRefs,
  #[error("only the current branch can be pushed")]
  NonCurrentBranch,
  #[error("creating or deleting refs is not supported")]
  RefMutationUnsupported,
  #[error("Challenges can only be deleted from the web client.")]
  ChallengeDeleteRestricted,
  #[error("Rejecting push: {0}")]
  PushRejected(String),
  #[error("Invalid challenge `{name}`: {reason}")]
  InvalidChallenge { name: String, reason: String },
  #[error("invalid prerequisites for challenge bucket `{bucket}`")]
  ChallengePrerequisites { bucket: String, reason: String },
  #[error("Milestone `{name}` has no prerequisites, it would never be achieved.")]
  MilestoneWithoutPrerequisites { name: String },
  #[error("Milestone `{name}` is declared more than once.")]
  DuplicateMilestone { name: String },
  #[error("Invalid milestone `{name}`: {reason}")]
  InvalidMilestone { name: String, reason: String },
  #[error("invalid prerequisites for milestone `{name}`")]
  MilestonePrerequisites { name: String, reason: String },
  #[error(
    "Hints for challenge `{name}` can only be appended in Git. Existing hints must be managed from the web client."
  )]
  HintsAppendOnly { name: String },
  #[error("Hints can only be appended in Git.")]
  HintsTruncated,
  #[error("Challenge `{0}` has conflicting ports in env.toml.")]
  ConflictingPorts(String),
  #[error("failed to read challenge directory `{path}`")]
  ChallengeDirRead { path: String, source: io::Error },
  #[error(transparent)]
  Bucket(#[from] BucketError),
  #[error(transparent)]
  Db(#[from] DbErr),
  #[error(transparent)]
  Json(#[from] serde_json::Error),
  #[error(transparent)]
  Io(#[from] io::Error),
  #[error(transparent)]
  Engine(#[from] EngineError),
}

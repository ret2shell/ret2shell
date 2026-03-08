use std::{
  collections::{BTreeMap, BTreeSet, HashSet},
  fmt::Display,
  net::SocketAddr,
};

use anyhow::{Context, anyhow, bail};
use axum::{
  Router,
  body::{Body, Bytes},
  extract::{ConnectInfo, Query, State},
  http::{HeaderMap, StatusCode},
  response::IntoResponse,
  routing::post,
};
use chrono::Utc;
use futures::TryStreamExt;
use r2s_bucket::{challenge::ChallengeBucket, game::GameBucket, git::DiffEntry};
use r2s_config::cluster::ChallengeEnv;
use r2s_database::{challenge, game, hint};
use sea_orm::{DatabaseTransaction, TransactionTrait};
use serde::Deserialize;
use tokio::{fs, sync::mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tracing::{error, info, warn};

use super::{
  core::invalidate_game_doc_cache,
  hook::{
    GIT_HOOK_AUTH_DOMAIN, GIT_HOOK_SESSION_DOMAIN, GitHookFormatter, GitHookMessageLevel,
    GitHookSession, strip_git_hook_ansi,
  },
};
use crate::traits::{GlobalState, ResponseError};

const ZERO_OID: &str = "0000000000000000000000000000000000000000";

pub(crate) fn router() -> Router<GlobalState> {
  Router::new().route("/git-hook/post-receive", post(post_receive))
}

#[derive(Deserialize)]
pub(crate) struct PostReceiveQuery {
  session: String,
  auth: String,
}

#[derive(Clone, Debug)]
struct UpdatedRef {
  old_oid: String,
  new_oid: String,
  ref_name: String,
}

#[derive(Default)]
struct SyncOutcome {
  invalidate_game: bool,
  invalidate_game_docs: bool,
  challenge_ids: BTreeSet<i64>,
  scoreboard_updates: Vec<challenge::Model>,
}

#[derive(Default)]
struct ChallengeChangeSet {
  buckets: BTreeSet<String>,
  db_backed: BTreeSet<String>,
  hints: BTreeSet<String>,
  env: BTreeSet<String>,
  checker: BTreeSet<String>,
}

#[derive(Clone)]
struct StreamLogger {
  tx: mpsc::Sender<Result<Bytes, std::io::Error>>,
  formatter: GitHookFormatter,
}

impl StreamLogger {
  fn new(tx: mpsc::Sender<Result<Bytes, std::io::Error>>, formatter: GitHookFormatter) -> Self {
    Self { tx, formatter }
  }

  fn name(&self, value: impl Display) -> String {
    self.formatter.name(value)
  }

  fn reference(&self, value: impl Display) -> String {
    self.formatter.reference(value)
  }

  fn old_oid(&self, value: impl Display) -> String {
    self.formatter.old_oid(value)
  }

  fn new_oid(&self, value: impl Display) -> String {
    self.formatter.new_oid(value)
  }

  fn count(&self, value: impl Display) -> String {
    self.formatter.count(value)
  }

  async fn header(&self, line: impl AsRef<str>) {
    self
      .send(self.formatter.line(GitHookMessageLevel::Header, line))
      .await;
  }

  async fn detail(&self, line: impl AsRef<str>) {
    self
      .send(self.formatter.line(GitHookMessageLevel::Detail, line))
      .await;
  }

  async fn info(&self, line: impl AsRef<str>) {
    let line = line.as_ref().to_owned();
    let message = strip_git_hook_ansi(&line);
    info!(message=%message, "git push sync");
    self
      .send(self.formatter.line(GitHookMessageLevel::Info, &line))
      .await;
  }

  async fn warn(&self, line: impl AsRef<str>) {
    let line = line.as_ref().to_owned();
    let message = strip_git_hook_ansi(&line);
    warn!(message=%message, "git push sync");
    self
      .send(self.formatter.line(GitHookMessageLevel::Warn, &line))
      .await;
  }

  async fn error(&self, line: impl AsRef<str>) {
    let line = line.as_ref().to_owned();
    let message = strip_git_hook_ansi(&line);
    error!(message=%message, "git push sync");
    self
      .send(self.formatter.line(GitHookMessageLevel::Error, &line))
      .await;
  }

  async fn success(&self, line: impl AsRef<str>) {
    let line = line.as_ref().to_owned();
    let message = strip_git_hook_ansi(&line);
    info!(message=%message, "git push sync");
    self
      .send(self.formatter.line(GitHookMessageLevel::Success, &line))
      .await;
  }

  async fn send(&self, line: impl Into<String>) {
    let mut line = line.into();
    if !line.ends_with('\n') {
      line.push('\n');
    }
    let _ = self.tx.send(Ok(Bytes::from(line))).await;
  }
}

pub(crate) async fn post_receive(
  ConnectInfo(addr): ConnectInfo<SocketAddr>, State(state): State<GlobalState>,
  Query(query): Query<PostReceiveQuery>, headers: HeaderMap, body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  if !addr.ip().is_loopback() {
    return Err(ResponseError::Forbidden(
      "internal git hook requests must originate from localhost".to_owned(),
    ));
  }

  let auth_key = state
    .cache
    .at(GIT_HOOK_AUTH_DOMAIN)
    .getdel::<String>(&query.session)
    .await?;
  if auth_key.as_deref() != Some(query.auth.as_str()) {
    return Err(ResponseError::Forbidden(
      "invalid or expired internal git hook authorization".to_owned(),
    ));
  }

  let session = state
    .cache
    .at(GIT_HOOK_SESSION_DOMAIN)
    .getdel::<GitHookSession>(&query.session)
    .await?
    .ok_or(ResponseError::Gone(
      "git hook session not found or expired".to_owned(),
    ))?;
  let payload = read_body(body).await?;
  let updates = parse_post_receive_updates(&payload)?;

  let (tx, rx) = mpsc::channel(64);
  let logger = StreamLogger::new(tx, GitHookFormatter::from_headers(&headers));
  tokio::spawn(async move {
    if let Err(err) = execute_post_receive(state, session, updates, logger.clone()).await {
      logger.error(format!("Synchronization failed: {err}")).await;
    }
  });

  let stream = ReceiverStream::new(rx);
  Ok((
    StatusCode::OK,
    [("Content-Type", "text/plain; charset=utf-8")],
    Body::from_stream(stream),
  ))
}

async fn execute_post_receive(
  state: GlobalState, session: GitHookSession, updates: Vec<UpdatedRef>, logger: StreamLogger,
) -> anyhow::Result<()> {
  let game_bucket = state.bucket.at(&session.game_bucket).await?;
  let head_ref = game_bucket.git.get_head_ref().await?;

  if updates.is_empty() {
    logger
      .warn("No updated refs were received from post-receive.")
      .await;
    return Ok(());
  }

  let (game, outcome) = match async {
    let game = game::get_by_bucket(&state.db.conn, &session.game_bucket)
      .await?
      .ok_or_else(|| anyhow!("game bucket `{}` no longer exists", session.game_bucket))?;
    if game.id != session.game_id {
      bail!("git hook session does not match the target game");
    }
    if !game.hidden {
      bail!("The repository is read-only while the game is visible to players.");
    }

    info!(game=%game.name, "git push sync started");
    logger.header("Ret2Shell post-receive").await;
    logger
      .detail(format!("Game   : {}", logger.name(&game.name)))
      .await;

    if updates.len() != 1 {
      logger
        .detail(format!(
          "Refs   : {} update(s)",
          logger.count(updates.len())
        ))
        .await;
      logger
        .error("Rejecting push: pushing multiple refs is not supported.")
        .await;
      bail!("pushing multiple refs is not supported");
    }

    let update = &updates[0];
    logger
      .detail(format!(
        "Branch : {}",
        logger.reference(display_ref_name(&update.ref_name))
      ))
      .await;
    logger
      .detail(format!(
        "Commit : {} -> {}",
        logger.old_oid(short_oid(&update.old_oid)),
        logger.new_oid(short_oid(&update.new_oid))
      ))
      .await;

    if update.ref_name != head_ref {
      logger
        .error(format!(
          "Rejecting push: only the current branch `{}` can be pushed.",
          logger.reference(&head_ref)
        ))
        .await;
      bail!("only the current branch can be pushed");
    }
    if update.old_oid == ZERO_OID || update.new_oid == ZERO_OID {
      logger
        .error("Rejecting push: creating or deleting refs is not supported.")
        .await;
      bail!("creating or deleting refs is not supported");
    }

    logger
      .info(format!(
        "Synchronizing `{}` from {} to {}.",
        logger.reference(display_ref_name(&update.ref_name)),
        logger.old_oid(short_oid(&update.old_oid)),
        logger.new_oid(short_oid(&update.new_oid))
      ))
      .await;

    game_bucket.git.reset_hard(&update.new_oid).await?;
    let diff = game_bucket
      .git
      .diff_name_status(&update.old_oid, &update.new_oid)
      .await?;
    logger
      .info(format!(
        "Detected {} changed path(s).",
        logger.count(diff.len())
      ))
      .await;

    let txn = state.db.conn.begin().await?;
    let outcome =
      match synchronize_repository(&state, &txn, &game, &game_bucket, &diff, &logger).await {
        Ok(outcome) => outcome,
        Err(err) => {
          txn.rollback().await.ok();
          return Err(err);
        }
      };
    if let Err(err) = txn.commit().await {
      logger
        .error("Database commit failed, rolling the repository back.")
        .await;
      return Err(err.into());
    }
    Ok::<(game::Model, SyncOutcome), anyhow::Error>((game, outcome))
  }
  .await
  {
    Ok(result) => result,
    Err(err) => {
      rollback_repository(&game_bucket, &updates, &head_ref, &logger).await?;
      return Err(err);
    }
  };

  if outcome.invalidate_game {
    state.cache.at("game").del(game.id).await.ok();
  }
  if outcome.invalidate_game_docs {
    invalidate_game_doc_cache(&state.cache, game.id).await.ok();
  }
  for challenge_id in outcome.challenge_ids {
    state.cache.at("challenge").del(challenge_id).await.ok();
  }
  for challenge in outcome.scoreboard_updates {
    state
      .queue
      .publish("scoreboard", challenge, &session.trace_id)
      .await
      .ok();
  }

  logger
    .success("Repository synchronization completed successfully.")
    .await;
  Ok(())
}

async fn synchronize_repository(
  state: &GlobalState, txn: &DatabaseTransaction, game: &game::Model, game_bucket: &GameBucket,
  diff: &[DiffEntry], logger: &StreamLogger,
) -> anyhow::Result<SyncOutcome> {
  let mut outcome = SyncOutcome::default();
  let mut challenge_changes = ChallengeChangeSet::default();
  let mut game_config_changed = false;
  let mut doc_changed = false;

  for entry in diff {
    classify_path(
      &entry.path,
      &mut game_config_changed,
      &mut doc_changed,
      &mut challenge_changes,
    );
    if let Some(old_path) = &entry.old_path {
      classify_path(
        old_path,
        &mut game_config_changed,
        &mut doc_changed,
        &mut challenge_changes,
      );
    }
  }

  let challenge_dirs = list_challenge_dirs(game_bucket).await?;
  let existing_challenges = challenge::get_full_list(txn, game.id).await?;
  let mut challenge_map = BTreeMap::new();
  for challenge in existing_challenges {
    let bucket = challenge
      .bucket
      .clone()
      .ok_or_else(|| anyhow!("Challenges can only be deleted from the web client."))?;
    if !challenge_dirs.contains(&bucket) {
      bail!("Challenges can only be deleted from the web client.");
    }
    challenge_map.insert(bucket, challenge);
  }

  let known_buckets: BTreeSet<String> = challenge_map.keys().cloned().collect();
  let new_buckets: BTreeSet<String> = challenge_dirs.difference(&known_buckets).cloned().collect();

  let mut current_game = game.clone();
  if game_config_changed {
    logger.info("Synchronizing game config...").await;
    current_game = sync_game_config(txn, &current_game, game_bucket).await?;
    outcome.invalidate_game = true;
  }
  if doc_changed {
    logger.info("Invalidating game document cache...").await;
    outcome.invalidate_game_docs = true;
  }

  for bucket_name in &new_buckets {
    logger
      .info(format!(
        "Creating challenge `{}` from the repository.",
        logger.name(bucket_name)
      ))
      .await;
    let challenge_bucket = game_bucket.at(bucket_name).await?;
    let created = create_challenge_from_bucket(txn, &current_game, &challenge_bucket).await?;
    if challenge_changes.checker.contains(bucket_name) {
      lint_checker(state, &challenge_bucket, logger).await?;
      state.checker.expire(&state.engine, &challenge_bucket).await;
    } else if checker_script_exists(&challenge_bucket).await {
      logger
        .warn(format!(
          "Skipping checker validation for new challenge `{}` because the checker script was not changed in this push.",
          logger.name(&challenge_bucket.name)
        ))
        .await;
    }
    if challenge_changes.env.contains(bucket_name)
      || challenge_changes.buckets.contains(bucket_name)
    {
      validate_env(&challenge_bucket).await?;
    }
    sync_hints_from_bucket(txn, created.id, &challenge_bucket, None).await?;
    outcome.challenge_ids.insert(created.id);
  }

  let mut affected_existing_buckets: BTreeSet<String> = challenge_changes
    .buckets
    .difference(&new_buckets)
    .cloned()
    .collect();
  for bucket_name in challenge_changes
    .db_backed
    .iter()
    .chain(challenge_changes.hints.iter())
  {
    if !new_buckets.contains(bucket_name) {
      affected_existing_buckets.insert(bucket_name.clone());
    }
  }

  for bucket_name in affected_existing_buckets {
    let existing = challenge_map.get(&bucket_name).with_context(|| {
      format!("challenge bucket `{bucket_name}` does not exist in the database")
    })?;
    let challenge_bucket = game_bucket.at(&bucket_name).await?;

    logger
      .info(format!(
        "Synchronizing challenge `{}`...",
        logger.name(&existing.name)
      ))
      .await;

    if challenge_changes.env.contains(&bucket_name) {
      validate_env(&challenge_bucket).await?;
    }
    if challenge_changes.checker.contains(&bucket_name) {
      lint_checker(state, &challenge_bucket, logger).await?;
      state.checker.expire(&state.engine, &challenge_bucket).await;
    }
    if challenge_changes.db_backed.contains(&bucket_name) {
      let synced = sync_challenge_record(txn, existing, &challenge_bucket).await?;
      if synced.score_rule != existing.score_rule {
        let (changed, _, synced) = challenge::maintain_score(txn, synced).await?;
        if changed {
          outcome.scoreboard_updates.push(synced.clone());
        }
        outcome.challenge_ids.insert(synced.id);
      } else {
        outcome.challenge_ids.insert(synced.id);
      }
    } else {
      outcome.challenge_ids.insert(existing.id);
    }
    if challenge_changes.hints.contains(&bucket_name) {
      sync_hints_from_bucket(txn, existing.id, &challenge_bucket, Some(existing)).await?;
      outcome.challenge_ids.insert(existing.id);
    }
  }

  Ok(outcome)
}

async fn sync_game_config(
  txn: &DatabaseTransaction, game: &game::Model, game_bucket: &GameBucket,
) -> anyhow::Result<game::Model> {
  let bucket_config = game_bucket.config().await?;
  Ok(
    game::update(
      txn,
      game::Model {
        id: game.id,
        updated_at: game.updated_at,
        name: bucket_config.name,
        brief: bucket_config.brief,
        introduction_id: game.introduction_id,
        start_at: bucket_config.start_at,
        end_at: bucket_config.end_at,
        register_at: bucket_config.register_at,
        archive_at: bucket_config.archive_at,
        hidden: game.hidden,
        offline: game.offline,
        frozen: game.frozen,
        host_type: convert_game_host_type(bucket_config.host_type)?,
        team_size: bucket_config.team_size,
        access_policy: game::AccessPolicy {
          sync: bucket_config.access_policy.sync,
          ..game.access_policy.clone()
        },
        archive_policy: game.archive_policy.clone(),
        hammer_policy: game.hammer_policy.clone(),
        cover: bucket_config.cover,
        logo: bucket_config.logo,
        enable_audit: game.enable_audit,
        can_register_after_started: bucket_config.can_register_after_started,
        award_rate: bucket_config.award_rate,
        award_rates: game.award_rates.clone(),
        admins: game.admins.clone(),
        weight: bucket_config.weight,
        bucket: game.bucket.clone(),
        token: game.token.clone(),
        timeline_presets: game.timeline_presets.clone(),
        node_selector: game.node_selector.clone(),
        traffic: game.traffic.clone(),
        lifecycle: game.lifecycle.clone(),
      },
    )
    .await?,
  )
}

async fn create_challenge_from_bucket(
  txn: &DatabaseTransaction, game: &game::Model, challenge_bucket: &ChallengeBucket,
) -> anyhow::Result<challenge::Model> {
  let config = challenge_bucket.config().await?;
  let content = challenge_bucket.description().await?;
  Ok(
    challenge::create(
      txn,
      challenge::Model {
        id: 0,
        name: config.name,
        updated_at: Utc::now(),
        content: Some(content),
        hidden: true,
        game_id: game.id,
        tag: convert_challenge_tag_list(config.tag)?,
        score_rule: convert_score_rule(config.score_rule)?,
        score: 0,
        bucket: Some(challenge_bucket.name.clone()),
        ref_id: None,
        release_at: None,
        archive_at: None,
      },
    )
    .await?,
  )
}

async fn sync_challenge_record(
  txn: &DatabaseTransaction, previous: &challenge::Model, challenge_bucket: &ChallengeBucket,
) -> anyhow::Result<challenge::Model> {
  let config = challenge_bucket.config().await?;
  let content = challenge_bucket.description().await?;
  Ok(
    challenge::update(
      txn,
      challenge::Model {
        id: previous.id,
        name: config.name,
        updated_at: previous.updated_at,
        content: Some(content),
        hidden: previous.hidden,
        game_id: previous.game_id,
        tag: convert_challenge_tag_list(config.tag)?,
        score_rule: convert_score_rule(config.score_rule)?,
        score: previous.score,
        bucket: previous.bucket.clone(),
        ref_id: previous.ref_id,
        release_at: previous.release_at,
        archive_at: previous.archive_at,
      },
    )
    .await?,
  )
}

async fn sync_hints_from_bucket(
  txn: &DatabaseTransaction, challenge_id: i64, challenge_bucket: &ChallengeBucket,
  previous: Option<&challenge::Model>,
) -> anyhow::Result<()> {
  let bucket_hints = challenge_bucket.hints().await?;
  let existing_hints = hint::get_list(txn, challenge_id).await?;
  if let Some(previous) = previous
    && bucket_hints.hints.len() < existing_hints.len()
  {
    bail!(
      "Hints for challenge `{}` can only be appended in Git. Existing hints must be managed from the web client.",
      previous.name
    );
  }

  for (index, existing) in existing_hints.iter().enumerate() {
    let Some(bucket_hint) = bucket_hints.hints.get(index) else {
      bail!("Hints can only be appended in Git.");
    };
    if existing.content != bucket_hint.content || existing.cost != bucket_hint.cost {
      let challenge_name = previous
        .map(|model| model.name.as_str())
        .unwrap_or(&challenge_bucket.name);
      bail!(
        "Hints for challenge `{challenge_name}` can only be appended in Git. Existing hints must be managed from the web client."
      );
    }
  }

  for bucket_hint in bucket_hints.hints.into_iter().skip(existing_hints.len()) {
    hint::create(
      txn,
      hint::Model {
        id: 0,
        created_at: Utc::now(),
        challenge_id,
        content: bucket_hint.content,
        cost: bucket_hint.cost,
      },
    )
    .await?;
  }

  Ok(())
}

async fn validate_env(challenge_bucket: &ChallengeBucket) -> anyhow::Result<()> {
  let Some(env) = challenge_bucket.env().await? else {
    return Ok(());
  };
  validate_env_config(&challenge_bucket.name, &env)
}

fn validate_env_config(bucket_name: &str, env: &ChallengeEnv) -> anyhow::Result<()> {
  let mut ports = HashSet::new();
  for image in &env.images {
    if let Some(port) = image.port
      && !ports.insert(port)
    {
      bail!("Challenge `{bucket_name}` has conflicting ports in env.toml.");
    }
  }
  Ok(())
}

async fn lint_checker(
  state: &GlobalState, challenge_bucket: &ChallengeBucket, logger: &StreamLogger,
) -> anyhow::Result<()> {
  let diagnostics = state.checker.lint(challenge_bucket).await?;
  if diagnostics.is_empty() {
    logger
      .info(format!(
        "Checker validation passed for challenge `{}`.",
        logger.name(&challenge_bucket.name)
      ))
      .await;
  } else {
    logger
      .warn(format!(
        "Checker validation produced {} diagnostic(s) for challenge `{}`.",
        logger.count(diagnostics.len()),
        logger.name(&challenge_bucket.name)
      ))
      .await;
  }
  Ok(())
}

async fn checker_script_exists(challenge_bucket: &ChallengeBucket) -> bool {
  fs::metadata(challenge_bucket.path().join("checker").join("main.rx"))
    .await
    .is_ok()
}

async fn rollback_repository(
  game_bucket: &GameBucket, updates: &[UpdatedRef], head_ref: &str, logger: &StreamLogger,
) -> anyhow::Result<()> {
  logger
    .warn("Synchronization failed; rolling the repository back.")
    .await;
  for update in updates.iter().rev() {
    if update.new_oid == ZERO_OID {
      game_bucket
        .git
        .update_ref(&update.ref_name, &update.old_oid, ZERO_OID)
        .await?;
      continue;
    }
    if update.old_oid == ZERO_OID {
      game_bucket
        .git
        .delete_ref(&update.ref_name, &update.new_oid)
        .await?;
      continue;
    }
    game_bucket
      .git
      .update_ref(&update.ref_name, &update.old_oid, &update.new_oid)
      .await?;
  }
  if let Some(head_update) = updates.iter().find(|update| update.ref_name == head_ref) {
    game_bucket.git.reset_hard(&head_update.old_oid).await?;
  } else {
    game_bucket.git.reset_hard("HEAD").await?;
  }
  logger.success("Repository rollback completed.").await;
  Ok(())
}

fn classify_path(
  path: &str, game_config_changed: &mut bool, doc_changed: &mut bool,
  challenge_changes: &mut ChallengeChangeSet,
) {
  match path {
    "config.toml" => {
      *game_config_changed = true;
      return;
    }
    "README.md" | "TRAINING.md" | "RULES.md" => {
      *doc_changed = true;
      return;
    }
    _ => {}
  }

  let mut parts = path.split('/');
  if parts.next() != Some("challenges") {
    return;
  }
  let Some(bucket_name) = parts.next().filter(|segment| !segment.is_empty()) else {
    return;
  };
  let bucket_name = bucket_name.to_owned();
  challenge_changes.buckets.insert(bucket_name.clone());
  match parts.next() {
    Some("config.toml") | Some("README.md") => {
      challenge_changes.db_backed.insert(bucket_name);
    }
    Some("hints.toml") => {
      challenge_changes.hints.insert(bucket_name);
    }
    Some("env.toml") => {
      challenge_changes.env.insert(bucket_name);
    }
    Some("checker") => {
      challenge_changes.checker.insert(bucket_name);
    }
    _ => {}
  }
}

async fn list_challenge_dirs(game_bucket: &GameBucket) -> anyhow::Result<BTreeSet<String>> {
  let mut result = BTreeSet::new();
  let challenges_root = game_bucket.git.path().join("challenges");
  let mut entries = tokio::fs::read_dir(&challenges_root)
    .await
    .with_context(|| {
      format!(
        "failed to read challenge directory `{}`",
        challenges_root.display()
      )
    })?;
  while let Some(entry) = entries.next_entry().await? {
    if !entry.file_type().await?.is_dir() {
      continue;
    }
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    result.insert(name);
  }
  Ok(result)
}

async fn read_body(body: Body) -> Result<Vec<u8>, ResponseError> {
  body
    .into_data_stream()
    .map_err(std::io::Error::other)
    .try_fold(Vec::new(), |mut acc, chunk| async move {
      acc.extend_from_slice(&chunk);
      Ok(acc)
    })
    .await
    .map_err(ResponseError::FileIoError)
}

fn parse_post_receive_updates(payload: &[u8]) -> Result<Vec<UpdatedRef>, ResponseError> {
  let payload = std::str::from_utf8(payload)
    .map_err(|_| ResponseError::BadRequest("invalid post-receive payload encoding".to_owned()))?;
  let mut updates = Vec::new();
  for line in payload.lines().filter(|line| !line.trim().is_empty()) {
    let mut parts = line.split_whitespace();
    let Some(old_oid) = parts.next() else {
      return Err(ResponseError::BadRequest(
        "invalid post-receive payload".to_owned(),
      ));
    };
    let Some(new_oid) = parts.next() else {
      return Err(ResponseError::BadRequest(
        "invalid post-receive payload".to_owned(),
      ));
    };
    let Some(ref_name) = parts.next() else {
      return Err(ResponseError::BadRequest(
        "invalid post-receive payload".to_owned(),
      ));
    };
    updates.push(UpdatedRef {
      old_oid: old_oid.to_owned(),
      new_oid: new_oid.to_owned(),
      ref_name: ref_name.to_owned(),
    });
  }
  Ok(updates)
}

fn short_oid(oid: &str) -> &str {
  oid.get(..7).unwrap_or(oid)
}

fn display_ref_name(ref_name: &str) -> &str {
  ref_name
    .strip_prefix("refs/heads/")
    .or_else(|| ref_name.strip_prefix("refs/tags/"))
    .unwrap_or(ref_name)
}

fn convert_game_host_type(host_type: r2s_bucket::game::HostType) -> anyhow::Result<game::HostType> {
  Ok(serde_json::from_value(serde_json::to_value(host_type)?)?)
}

fn convert_challenge_tag_list(
  tag_list: r2s_bucket::challenge::TagList,
) -> anyhow::Result<challenge::TagList> {
  Ok(serde_json::from_value(serde_json::to_value(tag_list)?)?)
}

fn convert_score_rule(
  score_rule: r2s_bucket::challenge::ScoreRule,
) -> anyhow::Result<challenge::ScoreRule> {
  Ok(serde_json::from_value(serde_json::to_value(score_rule)?)?)
}

#[cfg(test)]
mod tests {
  use r2s_config::cluster::{ChallengeEnv, ChallengeImage};

  use super::{
    ChallengeChangeSet, classify_path, display_ref_name, parse_post_receive_updates, short_oid,
    validate_env_config,
  };
  use crate::traits::ResponseError;

  #[allow(deprecated)]
  fn image(name: &str, port: Option<u16>) -> ChallengeImage {
    ChallengeImage {
      name: name.to_owned(),
      tag: "latest".to_owned(),
      cpu: 1.0,
      cpu_req: 0.5,
      mem: "256Mi".to_owned(),
      mem_req: "128Mi".to_owned(),
      storage: Some("1Gi".to_owned()),
      storage_req: Some("256Mi".to_owned()),
      port,
      service_type: None,
      protocol: None,
      app_protocol: None,
      description: None,
      restricted: None,
    }
  }

  fn env(images: Vec<ChallengeImage>) -> ChallengeEnv {
    ChallengeEnv {
      internet: true,
      restricted: Some(false),
      images,
      pull_secret: Some("registry-secret".to_owned()),
    }
  }

  #[test]
  fn git_hook_humanizes_common_ref_names() {
    assert_eq!(display_ref_name("refs/heads/main"), "main");
    assert_eq!(display_ref_name("refs/tags/v1.0.0"), "v1.0.0");
    assert_eq!(display_ref_name("refs/notes/build"), "refs/notes/build");
  }

  #[test]
  fn classify_path_tracks_repo_changes_for_game_and_challenges() {
    let mut game_config_changed = false;
    let mut doc_changed = false;
    let mut challenge_changes = ChallengeChangeSet::default();

    for path in [
      "config.toml",
      "README.md",
      "challenges/web/README.md",
      "challenges/web/hints.toml",
      "challenges/web/env.toml",
      "challenges/web/checker/main.rx",
      "challenges/web/assets/logo.png",
      "notes/todo.txt",
    ] {
      classify_path(
        path,
        &mut game_config_changed,
        &mut doc_changed,
        &mut challenge_changes,
      );
    }

    assert!(game_config_changed);
    assert!(doc_changed);
    assert!(challenge_changes.buckets.contains("web"));
    assert!(challenge_changes.db_backed.contains("web"));
    assert!(challenge_changes.hints.contains("web"));
    assert!(challenge_changes.env.contains("web"));
    assert!(challenge_changes.checker.contains("web"));
    assert_eq!(challenge_changes.buckets.len(), 1);
  }

  #[test]
  fn parse_post_receive_updates_reads_multiple_lines_and_skips_blanks() {
    let payload = br#"
old-1 new-1 refs/heads/main

old-2 new-2 refs/tags/v1.0.0
"#;

    let updates = parse_post_receive_updates(payload).unwrap();

    assert_eq!(updates.len(), 2);
    assert_eq!(updates[0].old_oid, "old-1");
    assert_eq!(updates[0].new_oid, "new-1");
    assert_eq!(updates[0].ref_name, "refs/heads/main");
    assert_eq!(updates[1].ref_name, "refs/tags/v1.0.0");
  }

  #[test]
  fn parse_post_receive_updates_rejects_invalid_input() {
    assert!(matches!(
      parse_post_receive_updates(b"old new"),
      Err(ResponseError::BadRequest(message)) if message == "invalid post-receive payload"
    ));
    assert!(matches!(
      parse_post_receive_updates(&[0xff]),
      Err(ResponseError::BadRequest(message))
        if message == "invalid post-receive payload encoding"
    ));
  }

  #[test]
  fn short_oid_truncates_long_hashes_but_keeps_short_values() {
    assert_eq!(short_oid("1234567890abcdef"), "1234567");
    assert_eq!(short_oid("dead"), "dead");
  }

  #[test]
  fn validate_env_config_detects_duplicate_ports() {
    assert!(
      validate_env_config(
        "web",
        &env(vec![image("api", Some(8080)), image("web", Some(8080))])
      )
      .is_err()
    );
    assert!(
      validate_env_config(
        "web",
        &env(vec![
          image("api", Some(8080)),
          image("web", Some(8081)),
          image("db", None)
        ]),
      )
      .is_ok()
    );
  }
}

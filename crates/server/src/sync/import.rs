use chrono::Utc;
use r2s_bucket::game::GameBucket;
use r2s_database::game;
use sea_orm::TransactionTrait;
use url::Url;
use validator::Validate;

use crate::{
  routes::game::repo_sync::{
    StreamLogger, finalize_repository_sync, synchronize_repository_import,
  },
  traits::GlobalState,
};

struct ImportBucketGuard {
  bucket: Option<GameBucket>,
  keep: bool,
}

impl ImportBucketGuard {
  fn new(bucket: GameBucket) -> Self {
    Self {
      bucket: Some(bucket),
      keep: false,
    }
  }

  fn bucket(&self) -> &GameBucket {
    self.bucket.as_ref().expect("import bucket is present")
  }

  fn keep(&mut self) {
    self.keep = true;
  }
}

impl Drop for ImportBucketGuard {
  fn drop(&mut self) {
    if self.keep {
      return;
    }
    if let Some(bucket) = self.bucket.take() {
      let path = bucket.git.path().to_path_buf();
      drop(bucket);
      std::fs::remove_dir_all(path).ok();
    }
  }
}

fn local_game_model(
  config: &r2s_bucket::game::GameConfig, bucket: &str, operator_id: i64,
) -> Result<game::Model, String> {
  let host_type = serde_json::from_value(
    serde_json::to_value(config.host_type.clone()).map_err(|error| error.to_string())?,
  )
  .map_err(|error| format!("unsupported host type: {error}"))?;
  let model = game::Model {
    id: 0,
    updated_at: Utc::now(),
    name: config.name.clone(),
    brief: config.brief.clone(),
    introduction_id: None,
    start_at: config.start_at,
    end_at: config.end_at,
    register_at: config.register_at,
    archive_at: config.archive_at,
    hidden: true,
    offline: false,
    frozen: false,
    host_type,
    team_size: config.team_size,
    env_limit: config.env_limit.filter(|&value| value > 0),
    access_policy: game::AccessPolicy {
      restrict: false,
      institutes: vec![],
      sync: 2,
    },
    archive_policy: game::ArchivePolicy::default(),
    hammer_policy: game::HammerPolicy::default(),
    cover: config.cover.clone(),
    logo: config.logo.clone(),
    enable_audit: false,
    can_register_after_started: config.can_register_after_started,
    award_rate: config.award_rate,
    award_rates: None,
    admins: game::Admins(vec![operator_id]),
    weight: 0,
    bucket: Some(bucket.to_owned()),
    token: Some(nanoid::nanoid!()),
    timeline_presets: None,
    node_selector: None,
    traffic: None,
    lifecycle: None,
    managed_distribution: None,
  };
  model.validate().map_err(|error| error.to_string())?;
  Ok(model)
}

pub(crate) async fn execute_import(
  state: GlobalState, endpoint: Url, credential: String, operator_id: i64, trace_id: String,
  logger: StreamLogger,
) -> Result<game::Model, String> {
  logger.header("Ret2Shell instance import").await;
  logger
    .info(format!(
      "Discovering source instance at {}...",
      endpoint.host_str().unwrap_or("source instance")
    ))
    .await;
  let discovered = crate::sync::discover::discover(&endpoint, &credential).await?;
  let descriptor = &discovered.descriptor;
  logger
    .info(format!(
      "Discovered game \"{}\" with bucket id {} at HEAD {}.",
      descriptor.name, descriptor.bucket_id, descriptor.head
    ))
    .await;
  if game::get_by_bucket(&state.db.conn, &descriptor.bucket_id)
    .await
    .map_err(|error| format!("failed to check for existing games: {error}"))?
    .is_some()
  {
    return Err(format!(
      "a game with bucket id {} already exists on this instance",
      descriptor.bucket_id
    ));
  }
  if r2s_database::distribution::get_by_bucket(&state.db.conn, &descriptor.bucket_id)
    .await
    .map_err(|error| format!("failed to check for existing distributions: {error}"))?
    .is_some()
  {
    return Err(format!(
      "a distribution for bucket id {} already exists on this instance",
      descriptor.bucket_id
    ));
  }
  let repository_url = discovered.repository_url.clone();
  logger
    .info(format!(
      "Cloning source repository from {}...",
      repository_url.host_str().unwrap_or("source instance")
    ))
    .await;
  let game_bucket = state
    .bucket
    .import_game(
      repository_url.as_str(),
      Some(&credential),
      &descriptor.bucket_id,
      &descriptor.head,
    )
    .await
    .map_err(|error| format!("failed to clone source repository: {error}"))?;
  let mut guard = ImportBucketGuard::new(game_bucket);
  let config = guard
    .bucket()
    .config()
    .await
    .map_err(|error| format!("failed to read source game config: {error}"))?;
  let head_oid = guard
    .bucket()
    .git
    .get_head()
    .await
    .map_err(|error| format!("failed to resolve source HEAD: {error}"))?;
  logger
    .info(format!("Imported repository HEAD: {head_oid}"))
    .await;
  let diff = guard
    .bucket()
    .git
    .snapshot_changes(&head_oid)
    .await
    .map_err(|error| format!("failed to build the initial snapshot: {error}"))?;
  logger
    .info(format!("Materializing {} tracked files...", diff.len()))
    .await;
  let bucket_name = guard.bucket().name.clone();
  let model = local_game_model(&config, &bucket_name, operator_id)?;
  let txn = state
    .db
    .conn
    .begin()
    .await
    .map_err(|error| format!("failed to start the import transaction: {error}"))?;
  let sync_result = async {
    let model = game::create(&txn, model)
      .await
      .map_err(|error| format!("failed to create the local game: {error}"))?;
    let outcome =
      synchronize_repository_import(&state, &txn, &model, guard.bucket(), &diff, &logger)
        .await
        .map_err(|error| format!("failed to materialize the source repository: {error}"))?;
    // media sync runs after materialization so the reference set is read from
    // the database rows of the freshly imported game
    crate::sync::media::synchronize_media(
      &state,
      &txn,
      &repository_url,
      &model,
      &credential,
      operator_id,
      &logger,
    )
    .await?;
    // the import pinned its admission head and verified the clone against it,
    // so the distribution starts with that head as the approved baseline
    let distribution = r2s_database::distribution::create(
      &txn,
      r2s_database::distribution::Model {
        id: 0,
        bucket_id: descriptor.bucket_id.clone(),
        endpoint: endpoint.to_string(),
        credential: credential.clone(),
        head_ref: descriptor.head.clone(),
        name: Some(descriptor.name.clone()),
        avatar: descriptor.avatar.clone(),
        description: Some(descriptor.description.clone()),
        enabled: false,
        interval_seconds: None,
        last_synced_oid: Some(descriptor.head.clone()),
        next_sync_at: None,
        last_attempt_at: None,
        last_success_at: None,
        last_status: r2s_database::distribution::STATUS_IDLE.to_owned(),
        last_error: None,
        consecutive_failures: 0,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
      },
    )
    .await
    .map_err(|error| format!("failed to create the distribution: {error}"))?;
    let mut managed = model.clone();
    managed.managed_distribution = Some(distribution.id);
    let model = game::update(&txn, managed)
      .await
      .map_err(|error| format!("failed to mark the game as managed: {error}"))?;
    txn
      .commit()
      .await
      .map_err(|error| format!("failed to commit the import transaction: {error}"))?;
    Ok::<(game::Model, _), String>((model, outcome))
  }
  .await?;
  let (model, outcome) = sync_result;
  // the transaction is committed, so the bucket is durable now: adopt it
  // before the post-commit finalization, otherwise a timeout or disconnect
  // during finalize would delete the bucket of an already imported game
  guard.keep();
  if let Err(error) =
    finalize_repository_sync(&state, &model, outcome, &bucket_name, &trace_id, &logger).await
  {
    logger
      .error(format!("failed to finalize the import: {error}"))
      .await;
  }
  logger
    .info(format!(
      "Registered distribution #{} managing the imported game.",
      model.managed_distribution.unwrap_or_default()
    ))
    .await;
  logger
    .success(format!("SYNC_IMPORT_GAME_ID={}", model.id))
    .await;
  Ok(model)
}

#[cfg(test)]
mod tests {
  use chrono::Utc;
  use r2s_bucket::game::{AccessPolicy, GameConfig, HostType};

  use super::local_game_model;

  #[test]
  fn imported_game_uses_local_security_defaults() {
    let now = Utc::now();
    let config = GameConfig {
      name: "Imported".to_owned(),
      updated_at: now,
      brief: "Imported training".to_owned(),
      start_at: now,
      end_at: Utc::now() + chrono::Duration::days(1),
      register_at: now,
      archive_at: Utc::now() + chrono::Duration::days(2),
      host_type: HostType::CTFTraining,
      team_size: 0,
      env_limit: Some(0),
      access_policy: AccessPolicy { sync: 0 },
      cover: None,
      logo: None,
      can_register_after_started: true,
      award_rate: 0,
      weight: 100,
    };
    let model = local_game_model(&config, "imported_bucket", 42).unwrap();
    assert!(model.hidden);
    assert_eq!(model.access_policy.sync, 2);
    assert_eq!(model.weight, 0);
    assert_eq!(model.admins.0, vec![42]);
    assert_eq!(model.bucket.as_deref(), Some("imported_bucket"));
    assert_ne!(model.token.as_deref(), Some("source token"));
    assert_eq!(model.env_limit, None);
    assert_eq!(model.managed_distribution, None);
  }
}

//! Used to init the new database and migrate the database from old versions.

use r2s_config::database;
use sea_orm::{ConnectOptions, DatabaseConnection};
use sea_orm_migration::prelude::*;
use tracing::log::LevelFilter;

mod migrations;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
  fn migrations() -> Vec<Box<dyn MigrationTrait>> {
    vec![
      Box::new(migrations::m_20230101_000001_create_config::Migration),
      Box::new(migrations::m_20240101_000001_create_institute::Migration),
      Box::new(migrations::m_20240101_000002_create_user::Migration),
      Box::new(migrations::m_20240101_000003_create_oauth::Migration),
      Box::new(migrations::m_20240101_000004_create_ip::Migration),
      Box::new(migrations::m_20240101_000005_link_ip_user::Migration),
      Box::new(migrations::m_20240102_000001_create_article::Migration),
      Box::new(migrations::m_20240102_000002_create_comment::Migration),
      Box::new(migrations::m_20240102_000003_create_calendar::Migration),
      Box::new(migrations::m_20240103_000001_create_media::Migration),
      Box::new(migrations::m_20240104_000001_create_game::Migration),
      Box::new(migrations::m_20240104_000002_create_notification::Migration),
      Box::new(migrations::m_20240104_000003_create_team::Migration),
      Box::new(migrations::m_20240104_000004_create_challenge::Migration),
      Box::new(migrations::m_20240104_000005_create_hint::Migration),
      Box::new(migrations::m_20240104_000006_create_submission::Migration),
      Box::new(migrations::m_20240104_000007_link_team_user::Migration),
      Box::new(migrations::m_20240104_000008_create_extra::Migration),
      Box::new(migrations::m_20240104_000009_create_audit::Migration),
      Box::new(migrations::m_20240104_000010_create_chat::Migration),
      Box::new(migrations::m_20241122_000001_game_timeline_presets::Migration),
      Box::new(migrations::m_20241122_000002_challenge_timeline::Migration),
      Box::new(migrations::m_20241122_000003_game_cluster_configs::Migration),
      Box::new(migrations::m_20241220_000001_game_award_rates::Migration),
      Box::new(migrations::m_20241226_000001_game_traffic::Migration),
      Box::new(migrations::m_20250105_000001_create_oauth_provider::Migration),
      Box::new(migrations::m_20250114_000001_create_oauth_index::Migration),
      Box::new(migrations::m_20250226_000001_game_archive_policy::Migration),
      Box::new(migrations::m_20250330_000001_create_team_tag::Migration),
      Box::new(migrations::m_20250622_000001_create_game_hammer_policy::Migration),
      Box::new(migrations::m_20250721_000001_create_ip_time_info::Migration),
      Box::new(migrations::m_20260307_000001_game_lifecycle::Migration),
      Box::new(migrations::m_20260704_000001_game_env_limit::Migration),
    ]
  }
}

#[derive(Clone, Debug)]
pub struct Database {
  pub conn: DatabaseConnection,
}

async fn get_conn(config: &Option<database::Config>) -> Result<DatabaseConnection, DbErr> {
  let config = config
    .clone()
    .ok_or(DbErr::Custom("database config not found".to_string()))?;
  let mut connect_options = ConnectOptions::new(config.dsn());
  connect_options
    .acquire_timeout(std::time::Duration::from_secs(15))
    .sqlx_logging(true)
    .sqlx_logging_level(LevelFilter::Debug);
  sea_orm::Database::connect(connect_options).await
}

pub async fn initialize(config: &Option<database::Config>) -> Result<(Database, bool), DbErr> {
  let conn = get_conn(config).await?;
  let needs_migrate = !Migrator::get_pending_migrations(&conn).await?.is_empty();
  if needs_migrate {
    Migrator::up(&conn, None).await?;
  }
  Ok((Database { conn }, needs_migrate))
}

pub async fn down(config: &Option<database::Config>) -> Result<(), DbErr> {
  let conn = get_conn(config).await?;
  Migrator::down(&conn, None).await?;
  Ok(())
}

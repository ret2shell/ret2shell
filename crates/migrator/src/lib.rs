//! Used to init the new database and migrate the database from old versions.

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
            Box::new(migrations::m_20240105_000001_create_instance::Migration),
        ]
    }
}

#[derive(Clone, Debug)]
pub struct Database {
    pub conn: DatabaseConnection,
}

pub async fn initialize(dsn: &str) -> Result<Database, DbErr> {
    let mut connect_options = ConnectOptions::new(dsn);
    connect_options
        .acquire_timeout(std::time::Duration::from_secs(15))
        .sqlx_logging(true)
        .sqlx_logging_level(LevelFilter::Debug);

    let conn = sea_orm::Database::connect(connect_options).await?;
    Migrator::up(&conn, None).await?;
    Ok(Database { conn })
}

pub async fn down(dsn: &str) -> Result<(), DbErr> {
    let mut connect_options = ConnectOptions::new(dsn);
    connect_options
        .sqlx_logging(true)
        .sqlx_logging_level(LevelFilter::Debug);

    let db: DatabaseConnection = sea_orm::Database::connect(connect_options).await?;
    Migrator::down(&db, None).await?;
    Ok(())
}

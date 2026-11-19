use sea_orm_migration::prelude::*;

use super::{
  m_20240104_000001_create_game::Game, m_20261111_000002_create_sync_source::SyncSource,
  m_20261111_000003_create_sync_job::SyncJob as LegacySyncJob,
  m_20261112_000001_create_distribution::Distribution,
};

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261112_000002_rework_managed_sync"
  }
}

#[derive(Iden)]
enum SyncJob {
  Table,
  Id,
  DistributionId,
  LocalGameId,
  Trigger,
  Status,
  OldOid,
  NewOid,
  ExpectedHead,
  TraceId,
  ErrorCode,
  ErrorMessage,
  Log,
  CreatedAt,
  StartedAt,
  FinishedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    // the legacy sync_source model has no admission head, so its rows cannot
    // be mapped onto the distribution model: the pre-release tables are
    // dropped and rebuilt, imported games simply re-import
    manager
      .drop_table(Table::drop().table(LegacySyncJob::Table).to_owned())
      .await?;
    manager
      .drop_table(Table::drop().table(SyncSource::Table).to_owned())
      .await?;

    manager
      .create_table(
        Table::create()
          .table(SyncJob::Table)
          .col(
            ColumnDef::new(SyncJob::Id)
              .big_integer()
              .not_null()
              .auto_increment()
              .primary_key(),
          )
          .col(
            ColumnDef::new(SyncJob::DistributionId)
              .big_integer()
              .not_null(),
          )
          .foreign_key(
            ForeignKey::create()
              .from(SyncJob::Table, SyncJob::DistributionId)
              .to(Distribution::Table, Distribution::Id)
              .on_update(ForeignKeyAction::Cascade)
              .on_delete(ForeignKeyAction::Cascade),
          )
          .col(
            ColumnDef::new(SyncJob::LocalGameId)
              .big_integer()
              .not_null(),
          )
          .col(
            ColumnDef::new(SyncJob::Trigger)
              .string_len(32)
              .not_null()
              .default("manual"),
          )
          .col(
            ColumnDef::new(SyncJob::Status)
              .string_len(32)
              .not_null()
              .default("queued"),
          )
          .col(ColumnDef::new(SyncJob::OldOid).string_len(64))
          .col(ColumnDef::new(SyncJob::NewOid).string_len(64))
          // the admission head approved for this specific run, kept for audit
          .col(ColumnDef::new(SyncJob::ExpectedHead).string_len(64))
          .col(
            ColumnDef::new(SyncJob::TraceId)
              .string_len(64)
              .not_null()
              .default(""),
          )
          .col(ColumnDef::new(SyncJob::ErrorCode).string_len(64))
          .col(ColumnDef::new(SyncJob::ErrorMessage).text())
          .col(ColumnDef::new(SyncJob::Log).text().not_null().default(""))
          .col(
            ColumnDef::new(SyncJob::CreatedAt)
              .timestamp_with_time_zone()
              .not_null(),
          )
          .col(ColumnDef::new(SyncJob::StartedAt).timestamp_with_time_zone())
          .col(ColumnDef::new(SyncJob::FinishedAt).timestamp_with_time_zone())
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(SyncJob::Table)
          .col(SyncJob::DistributionId)
          .col(SyncJob::Status)
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(SyncJob::Table)
          .col(SyncJob::Status)
          .col(SyncJob::CreatedAt)
          .to_owned(),
      )
      .await?;

    manager
      .alter_table(
        Table::alter()
          .table(Game::Table)
          .add_column_if_not_exists(
            ColumnDef::new(Game::ManagedDistribution)
              .big_integer()
              .null(),
          )
          .to_owned(),
      )
      .await?;
    manager
      .create_foreign_key(
        ForeignKey::create()
          .name("fk-game-managed_distribution-distribution")
          .from(Game::Table, Game::ManagedDistribution)
          .to(Distribution::Table, Distribution::Id)
          .on_update(ForeignKeyAction::Cascade)
          .on_delete(ForeignKeyAction::SetNull)
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_foreign_key(
        ForeignKey::drop()
          .table(Game::Table)
          .name("fk-game-managed_distribution-distribution")
          .to_owned(),
      )
      .await?;
    manager
      .alter_table(
        Table::alter()
          .table(Game::Table)
          .drop_column(Game::ManagedDistribution)
          .to_owned(),
      )
      .await?;
    manager
      .drop_table(Table::drop().table(SyncJob::Table).to_owned())
      .await?;
    // restoring the legacy tables is intentionally not supported: their rows
    // were dropped irrecoverably in `up`
    Ok(())
  }
}

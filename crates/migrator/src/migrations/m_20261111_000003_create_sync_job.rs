use sea_orm_migration::prelude::*;

use super::m_20261111_000002_create_sync_source::SyncSource;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261111_000003_create_sync_job"
  }
}

#[derive(Iden)]
pub enum SyncJob {
  Table,
  Id,
  SourceId,
  LocalGameId,
  Trigger,
  Status,
  OldOid,
  NewOid,
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
          .col(ColumnDef::new(SyncJob::SourceId).big_integer().not_null())
          .foreign_key(
            ForeignKey::create()
              .from(SyncJob::Table, SyncJob::SourceId)
              .to(SyncSource::Table, SyncSource::Id)
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
          .col(SyncJob::SourceId)
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
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_table(Table::drop().table(SyncJob::Table).to_owned())
      .await
  }
}

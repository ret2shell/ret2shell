use sea_orm_migration::prelude::*;

use super::m_20240104_000001_create_game::Game;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261111_000002_create_sync_source"
  }
}

#[derive(Iden)]
pub enum SyncSource {
  Table,
  Id,
  RepositoryUrl,
  LocalGameId,
  Credential,
  Enabled,
  IntervalSeconds,
  LastSyncedOid,
  NextSyncAt,
  LastAttemptAt,
  LastSuccessAt,
  LastStatus,
  LastError,
  ConsecutiveFailures,
  CreatedAt,
  UpdatedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .create_table(
        Table::create()
          .table(SyncSource::Table)
          .col(
            ColumnDef::new(SyncSource::Id)
              .big_integer()
              .not_null()
              .auto_increment()
              .primary_key(),
          )
          .col(
            ColumnDef::new(SyncSource::RepositoryUrl)
              .string_len(2048)
              .not_null(),
          )
          .col(
            ColumnDef::new(SyncSource::LocalGameId)
              .big_integer()
              .not_null(),
          )
          .foreign_key(
            ForeignKey::create()
              .from(SyncSource::Table, SyncSource::LocalGameId)
              .to(Game::Table, Game::Id)
              .on_update(ForeignKeyAction::Cascade)
              .on_delete(ForeignKeyAction::Cascade),
          )
          .col(
            ColumnDef::new(SyncSource::Credential)
              .string_len(2048)
              .not_null()
              .default(""),
          )
          .col(
            ColumnDef::new(SyncSource::Enabled)
              .boolean()
              .not_null()
              .default(false),
          )
          .col(ColumnDef::new(SyncSource::IntervalSeconds).big_integer())
          .col(ColumnDef::new(SyncSource::LastSyncedOid).string_len(64))
          .col(ColumnDef::new(SyncSource::NextSyncAt).timestamp_with_time_zone())
          .col(ColumnDef::new(SyncSource::LastAttemptAt).timestamp_with_time_zone())
          .col(ColumnDef::new(SyncSource::LastSuccessAt).timestamp_with_time_zone())
          .col(
            ColumnDef::new(SyncSource::LastStatus)
              .string_len(32)
              .not_null()
              .default("idle"),
          )
          .col(ColumnDef::new(SyncSource::LastError).text())
          .col(
            ColumnDef::new(SyncSource::ConsecutiveFailures)
              .integer()
              .not_null()
              .default(0),
          )
          .col(
            ColumnDef::new(SyncSource::CreatedAt)
              .timestamp_with_time_zone()
              .not_null(),
          )
          .col(
            ColumnDef::new(SyncSource::UpdatedAt)
              .timestamp_with_time_zone()
              .not_null(),
          )
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(SyncSource::Table)
          .col(SyncSource::RepositoryUrl)
          .unique()
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(SyncSource::Table)
          .col(SyncSource::LocalGameId)
          .unique()
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(SyncSource::Table)
          .col(SyncSource::Enabled)
          .col(SyncSource::NextSyncAt)
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_table(Table::drop().table(SyncSource::Table).to_owned())
      .await
  }
}

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261112_000001_create_distribution"
  }
}

#[derive(Iden)]
pub enum Distribution {
  Table,
  Id,
  BucketId,
  Endpoint,
  Credential,
  HeadRef,
  Name,
  Avatar,
  Description,
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
          .table(Distribution::Table)
          .col(
            ColumnDef::new(Distribution::Id)
              .big_integer()
              .not_null()
              .auto_increment()
              .primary_key(),
          )
          // the real bucket id of the source game: the stable sync identity
          .col(
            ColumnDef::new(Distribution::BucketId)
              .string_len(128)
              .not_null(),
          )
          .col(
            ColumnDef::new(Distribution::Endpoint)
              .string_len(2048)
              .not_null(),
          )
          .col(
            ColumnDef::new(Distribution::Credential)
              .string_len(2048)
              .not_null()
              .default(""),
          )
          // the approved admission commit the distribution may sync to
          .col(
            ColumnDef::new(Distribution::HeadRef)
              .string_len(64)
              .not_null(),
          )
          .col(ColumnDef::new(Distribution::Name).string_len(255))
          .col(ColumnDef::new(Distribution::Avatar).string_len(2048))
          .col(ColumnDef::new(Distribution::Description).text())
          .col(
            ColumnDef::new(Distribution::Enabled)
              .boolean()
              .not_null()
              .default(false),
          )
          .col(ColumnDef::new(Distribution::IntervalSeconds).big_integer())
          .col(ColumnDef::new(Distribution::LastSyncedOid).string_len(64))
          .col(ColumnDef::new(Distribution::NextSyncAt).timestamp_with_time_zone())
          .col(ColumnDef::new(Distribution::LastAttemptAt).timestamp_with_time_zone())
          .col(ColumnDef::new(Distribution::LastSuccessAt).timestamp_with_time_zone())
          .col(
            ColumnDef::new(Distribution::LastStatus)
              .string_len(32)
              .not_null()
              .default("idle"),
          )
          .col(ColumnDef::new(Distribution::LastError).text())
          .col(
            ColumnDef::new(Distribution::ConsecutiveFailures)
              .integer()
              .not_null()
              .default(0),
          )
          .col(
            ColumnDef::new(Distribution::CreatedAt)
              .timestamp_with_time_zone()
              .not_null(),
          )
          .col(
            ColumnDef::new(Distribution::UpdatedAt)
              .timestamp_with_time_zone()
              .not_null(),
          )
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(Distribution::Table)
          .col(Distribution::BucketId)
          .unique()
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(Distribution::Table)
          .col(Distribution::Enabled)
          .col(Distribution::NextSyncAt)
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_table(Table::drop().table(Distribution::Table).to_owned())
      .await
  }
}

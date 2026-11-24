use sea_orm_migration::prelude::*;

use super::m_20240101_000002_create_user::User;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261111_000001_create_passkey"
  }
}

#[derive(Iden)]
pub enum Passkey {
  Table,
  Id,
  UserId,
  Name,
  CredentialId,
  Registration,
  LastUsedAt,
  CreatedAt,
  UpdatedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .create_table(
        Table::create()
          .table(Passkey::Table)
          .col(
            ColumnDef::new(Passkey::Id)
              .big_integer()
              .not_null()
              .auto_increment()
              .primary_key(),
          )
          .col(ColumnDef::new(Passkey::UserId).big_integer().not_null())
          .foreign_key(
            ForeignKey::create()
              .from(Passkey::Table, Passkey::UserId)
              .to(User::Table, User::Id)
              .on_update(ForeignKeyAction::Cascade)
              .on_delete(ForeignKeyAction::Cascade),
          )
          .col(
            ColumnDef::new(Passkey::Name)
              .string_len(63)
              .not_null()
              .default(""),
          )
          .col(
            ColumnDef::new(Passkey::CredentialId)
              .string_len(511)
              .not_null(),
          )
          .col(
            ColumnDef::new(Passkey::Registration)
              .json_binary()
              .not_null(),
          )
          .col(ColumnDef::new(Passkey::LastUsedAt).timestamp_with_time_zone())
          .col(
            ColumnDef::new(Passkey::CreatedAt)
              .timestamp_with_time_zone()
              .not_null(),
          )
          .col(
            ColumnDef::new(Passkey::UpdatedAt)
              .timestamp_with_time_zone()
              .not_null(),
          )
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(Passkey::Table)
          .col(Passkey::CredentialId)
          .unique()
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .table(Passkey::Table)
          .col(Passkey::UserId)
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_table(Table::drop().table(Passkey::Table).to_owned())
      .await
  }
}

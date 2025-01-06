use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20250105_000001_create_oauth_provider"
  }
}

#[derive(Iden)]
pub enum OauthProvider {
  Table,
  Id,
  Name,
  Avatar,
  Provider,
  Script,
  Portal,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .create_table(
        Table::create()
          .table(OauthProvider::Table)
          .col(
            ColumnDef::new(OauthProvider::Id)
              .big_integer()
              .not_null()
              .auto_increment()
              .primary_key(),
          )
          .col(
            ColumnDef::new(OauthProvider::Name)
              .string_len(127)
              .not_null(),
          )
          .col(ColumnDef::new(OauthProvider::Avatar).string_len(255))
          .col(
            ColumnDef::new(OauthProvider::Provider)
              .string_len(63)
              .unique_key()
              .not_null(),
          )
          .col(ColumnDef::new(OauthProvider::Script).text().not_null())
          .col(ColumnDef::new(OauthProvider::Portal).string_len(255))
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_table(Table::drop().table(OauthProvider::Table).to_owned())
      .await
  }
}

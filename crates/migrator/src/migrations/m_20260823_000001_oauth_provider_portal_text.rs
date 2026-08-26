use sea_orm_migration::prelude::*;

use super::m_20250105_000001_create_oauth_provider::OauthProvider;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260823_000001_oauth_provider_portal_text"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(OauthProvider::Table)
          .modify_column(ColumnDef::new(OauthProvider::Portal).text())
          .to_owned(),
      )
      .await?;
    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(OauthProvider::Table)
          .modify_column(ColumnDef::new(OauthProvider::Portal).string_len(255))
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

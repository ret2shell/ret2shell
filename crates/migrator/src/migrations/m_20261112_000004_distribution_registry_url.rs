use sea_orm_migration::prelude::*;

use super::m_20261112_000001_create_distribution::Distribution;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261112_000004_distribution_registry_url"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Distribution::Table)
          .add_column_if_not_exists(
            ColumnDef::new(Distribution::RegistryUrl)
              .string_len(2048)
              .null(),
          )
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Distribution::Table)
          .drop_column(Distribution::RegistryUrl)
          .to_owned(),
      )
      .await
  }
}

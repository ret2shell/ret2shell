use sea_orm_migration::prelude::*;

use super::m_20240104_000004_create_challenge::Challenge;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260915_000001_challenge_prerequisites_avatar"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Challenge::Table)
          .add_column_if_not_exists(
            ColumnDef::new(Challenge::Prerequisites)
              .json_binary()
              .not_null()
              .default("[]"),
          )
          .add_column_if_not_exists(ColumnDef::new(Challenge::Avatar).string_len(255).null())
          .to_owned(),
      )
      .await?;
    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Challenge::Table)
          .drop_column(Challenge::Prerequisites)
          .drop_column(Challenge::Avatar)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

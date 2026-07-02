use sea_orm_migration::prelude::*;

use super::m_20240104_000003_create_team::Team;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260702_000001_team_is_llm_used_default_true"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Team::Table)
          .modify_column(
            ColumnDef::new(Team::IsLlmUsed)
              .boolean()
              .not_null()
              .default(true),
          )
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Team::Table)
          .modify_column(
            ColumnDef::new(Team::IsLlmUsed)
              .boolean()
              .not_null()
              .default(false),
          )
          .to_owned(),
      )
      .await
  }
}

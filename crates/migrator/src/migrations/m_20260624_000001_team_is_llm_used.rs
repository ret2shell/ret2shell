use sea_orm_migration::prelude::*;

use super::m_20240104_000003_create_team::Team;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260624_000001_team_is_llm_used"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Team::Table)
          .add_column_if_not_exists(
            ColumnDef::new(Team::IsLlmUsed)
              .boolean()
              .not_null()
              .default(false),
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
          .drop_column(Team::IsLlmUsed)
          .to_owned(),
      )
      .await
  }
}

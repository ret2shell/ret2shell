use sea_orm_migration::prelude::*;

use super::m_20240104_000006_create_submission::Submission;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260624_000002_submission_is_llm_used"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Submission::Table)
          .add_column_if_not_exists(ColumnDef::new(Submission::IsLlmUsed).boolean())
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Submission::Table)
          .drop_column(Submission::IsLlmUsed)
          .to_owned(),
      )
      .await
  }
}

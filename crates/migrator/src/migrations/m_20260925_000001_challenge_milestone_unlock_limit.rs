use sea_orm_migration::prelude::*;

use super::{
  m_20240104_000004_create_challenge::Challenge,
  m_20260915_000002_create_challenge_milestone::ChallengeMilestone,
};

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260925_000001_challenge_milestone_unlock_limit"
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
            ColumnDef::new(Challenge::UnlockLimit)
              .integer()
              .not_null()
              .default(0),
          )
          .to_owned(),
      )
      .await?;
    manager
      .alter_table(
        Table::alter()
          .table(ChallengeMilestone::Table)
          .add_column_if_not_exists(
            ColumnDef::new(ChallengeMilestone::UnlockLimit)
              .integer()
              .not_null()
              .default(0),
          )
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
          .drop_column(Challenge::UnlockLimit)
          .to_owned(),
      )
      .await?;
    manager
      .alter_table(
        Table::alter()
          .table(ChallengeMilestone::Table)
          .drop_column(ChallengeMilestone::UnlockLimit)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

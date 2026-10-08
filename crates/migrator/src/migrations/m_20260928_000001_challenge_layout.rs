use sea_orm_migration::prelude::*;

use super::{
  m_20240104_000004_create_challenge::Challenge,
  m_20260915_000002_create_challenge_milestone::ChallengeMilestone,
};

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260928_000001_challenge_layout"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Challenge::Table)
          .add_column_if_not_exists(ColumnDef::new(Challenge::LayoutCol).integer())
          .add_column_if_not_exists(ColumnDef::new(Challenge::LayoutRow).integer())
          .to_owned(),
      )
      .await?;
    manager
      .alter_table(
        Table::alter()
          .table(ChallengeMilestone::Table)
          .add_column_if_not_exists(ColumnDef::new(ChallengeMilestone::LayoutCol).integer())
          .add_column_if_not_exists(ColumnDef::new(ChallengeMilestone::LayoutRow).integer())
          .to_owned(),
      )
      .await?;
    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(ChallengeMilestone::Table)
          .drop_column(ChallengeMilestone::LayoutRow)
          .drop_column(ChallengeMilestone::LayoutCol)
          .to_owned(),
      )
      .await?;
    manager
      .alter_table(
        Table::alter()
          .table(Challenge::Table)
          .drop_column(Challenge::LayoutRow)
          .drop_column(Challenge::LayoutCol)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

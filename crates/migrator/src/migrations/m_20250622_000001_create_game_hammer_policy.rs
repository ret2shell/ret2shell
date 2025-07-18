use sea_orm_migration::prelude::*;

use super::m_20240104_000001_create_game::Game;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20250622_000001_create_game_hammer_policy"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Game::Table)
          .add_column_if_not_exists(
            ColumnDef::new(Game::HammerPolicy)
              .json_binary()
              .not_null()
              .default("{}"),
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
          .table(Game::Table)
          .drop_column(Game::HammerPolicy)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

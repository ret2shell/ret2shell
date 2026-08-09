use sea_orm_migration::prelude::*;

use super::m_20240104_000001_create_game::Game;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260704_000001_game_env_limit"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Game::Table)
          .add_column(ColumnDef::new(Game::EnvLimit).integer())
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
          .drop_column(Game::EnvLimit)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

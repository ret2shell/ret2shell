use sea_orm_migration::prelude::*;

use super::m_20240104_000001_create_game::Game;

#[derive(Iden)]
enum Blackout {
  Blackout,
}

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260826_000001_game_blackout"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Game::Table)
          .add_column(
            ColumnDef::new(Blackout::Blackout)
              .boolean()
              .not_null()
              .default(false),
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
          .drop_column(Blackout::Blackout)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

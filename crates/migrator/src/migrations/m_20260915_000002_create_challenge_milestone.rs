use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240104_000001_create_game::Game;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260915_000002_create_challenge_milestone"
  }
}

#[derive(Iden)]
pub enum ChallengeMilestone {
  Table,
  Id,
  CreatedAt,
  UpdatedAt,
  GameId,
  Prerequisites,
  Avatar,
  BonusScore,
  Name,
  Description,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .create_table(
        Table::create()
          .table(ChallengeMilestone::Table)
          .col(
            ColumnDef::new(ChallengeMilestone::Id)
              .big_integer()
              .not_null()
              .auto_increment()
              .primary_key(),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::CreatedAt)
              .timestamp_with_time_zone()
              .not_null()
              .default(CurrentTimestamp),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::UpdatedAt)
              .timestamp_with_time_zone()
              .not_null()
              .default(CurrentTimestamp),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::GameId)
              .big_integer()
              .not_null(),
          )
          .foreign_key(
            ForeignKey::create()
              .from(ChallengeMilestone::Table, ChallengeMilestone::GameId)
              .to(Game::Table, Game::Id)
              .on_update(ForeignKeyAction::Cascade)
              // do not allow delete a game if it contains milestones
              // delete all milestones to prevent dangling references
              .on_delete(ForeignKeyAction::Restrict),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::Prerequisites)
              .json_binary()
              .not_null()
              .default("[]"),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::Avatar)
              .string_len(255)
              .null(),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::BonusScore)
              .integer()
              .not_null()
              .default(0),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::Name)
              .string_len(127)
              .not_null(),
          )
          .col(
            ColumnDef::new(ChallengeMilestone::Description)
              .text()
              .not_null(),
          )
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_table(Table::drop().table(ChallengeMilestone::Table).to_owned())
      .await
  }
}

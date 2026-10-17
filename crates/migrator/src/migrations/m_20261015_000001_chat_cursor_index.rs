use sea_orm_migration::prelude::*;

use super::m_20240104_000010_create_chat::Chat;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261015_000001_chat_cursor_index"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .create_index(
        Index::create()
          .if_not_exists()
          .name("idx_chat_team_challenge_id")
          .table(Chat::Table)
          .col(Chat::TeamId)
          .col(Chat::ChallengeId)
          .col(Chat::Id)
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .if_not_exists()
          .name("idx_chat_game_challenge_team_id")
          .table(Chat::Table)
          .col(Chat::GameId)
          .col(Chat::ChallengeId)
          .col(Chat::TeamId)
          .col(Chat::Id)
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .if_not_exists()
          .name("idx_chat_team_unread")
          .table(Chat::Table)
          .col(Chat::TeamId)
          .col(Chat::IsAdmin)
          .col(Chat::Checked)
          .to_owned(),
      )
      .await?;
    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_index(
        Index::drop()
          .name("idx_chat_team_challenge_id")
          .table(Chat::Table)
          .to_owned(),
      )
      .await?;
    manager
      .drop_index(
        Index::drop()
          .name("idx_chat_game_challenge_team_id")
          .table(Chat::Table)
          .to_owned(),
      )
      .await?;
    manager
      .drop_index(
        Index::drop()
          .name("idx_chat_team_unread")
          .table(Chat::Table)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

use sea_orm_migration::prelude::*;

use super::m_20260915_000002_create_challenge_milestone::ChallengeMilestone;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20260924_000001_challenge_milestone_unique_name"
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .create_index(
        Index::create()
          .name("idx_challenge_milestone_game_name")
          .unique()
          .table(ChallengeMilestone::Table)
          .col(ChallengeMilestone::GameId)
          .col(ChallengeMilestone::Name)
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_index(
        Index::drop()
          .name("idx_challenge_milestone_game_name")
          .table(ChallengeMilestone::Table)
          .to_owned(),
      )
      .await
  }
}

use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240104_000001_create_game::Game;
pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000004_create_challenge"
    }
}

#[derive(Iden)]
pub enum Challenge {
    Table,
    Id,
    UpdatedAt,
    Name,
    Content,
    Hidden,
    GameId,
    Tag,
    ScoreRange,
    CurrentScore,
    Bucket,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Challenge::Table)
                    .col(
                        ColumnDef::new(Challenge::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Challenge::Name).string_len(127).not_null())
                    .col(ColumnDef::new(Challenge::Content).text().not_null())
                    .col(ColumnDef::new(Challenge::Hidden).boolean().not_null())
                    .col(ColumnDef::new(Challenge::GameId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Challenge::Table, Challenge::GameId)
                            .to(Game::Table, Game::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            // do not allow delete a game if it contains challenges
                            // hidden it instead or delete all challenges to prevent dangling
                            // references
                            .on_delete(ForeignKeyAction::Restrict),
                    )
                    .col(
                        ColumnDef::new(Challenge::Tag)
                            .json_binary()
                            .not_null()
                            .default("[]"),
                    )
                    .col(
                        ColumnDef::new(Challenge::ScoreRange)
                            .json_binary()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Challenge::CurrentScore)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Challenge::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Challenge::Bucket).string_len(127).not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Challenge::Table).to_owned())
            .await
    }
}

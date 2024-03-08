use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240102_000001_create_article::Article;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000001_create_game"
    }
}

#[derive(Iden)]
pub enum Game {
    Table,
    Id,
    UpdatedAt,
    Name,
    Brief,
    IntroductionId,
    StartAt,
    EndAt,
    RegisterAt,
    ArchiveAt,
    Hidden,
    Frozen,
    Offline,
    HostType,
    TeamSize,
    AccessPolicy,
    Cover,
    Logo,
    EnableAudit,
    CanRegisterAfterStarted,
    AwardRate,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Game::Table)
                    .col(
                        ColumnDef::new(Game::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Game::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Game::Name).string_len(255).not_null())
                    .col(ColumnDef::new(Game::Brief).string_len(255).not_null())
                    .col(ColumnDef::new(Game::IntroductionId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Game::Table, Game::IntroductionId)
                            .to(Article::Table, Article::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(
                        ColumnDef::new(Game::StartAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Game::EndAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(Game::RegisterAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(Game::ArchiveAt).timestamp_with_time_zone())
                    .col(ColumnDef::new(Game::Hidden).boolean().not_null())
                    .col(ColumnDef::new(Game::Offline).boolean().not_null())
                    .col(ColumnDef::new(Game::Frozen).boolean().not_null())
                    .col(ColumnDef::new(Game::HostType).integer().not_null())
                    .col(ColumnDef::new(Game::TeamSize).integer().not_null())
                    .col(
                        ColumnDef::new(Game::AccessPolicy)
                            .json_binary()
                            .not_null()
                            .default("[{\"institute\":\"*\"}]"),
                    )
                    .col(ColumnDef::new(Game::Cover).string_len(255))
                    .col(ColumnDef::new(Game::Logo).string_len(255))
                    .col(ColumnDef::new(Game::EnableAudit).boolean().not_null())
                    .col(
                        ColumnDef::new(Game::CanRegisterAfterStarted)
                            .boolean()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Game::AwardRate)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Game::Table).to_owned())
            .await
    }
}

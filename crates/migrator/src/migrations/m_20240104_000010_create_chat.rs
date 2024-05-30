use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::{
    m_20240101_000002_create_user::User, m_20240104_000001_create_game::Game,
    m_20240104_000003_create_team::Team, m_20240104_000004_create_challenge::Challenge,
};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000010_create_chat"
    }
}

#[derive(Iden)]
pub enum Chat {
    Table,
    Id,
    CreatedAt,
    Content,
    UserId,
    TeamId,
    GameId,
    ChallengeId,
    Checked, // whether the message has been seen.
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Chat::Table)
                    .col(
                        ColumnDef::new(Chat::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Chat::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Chat::Content).text().not_null())
                    .col(ColumnDef::new(Chat::UserId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Chat::Table, Chat::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .col(ColumnDef::new(Chat::TeamId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Chat::Table, Chat::TeamId)
                            .to(Team::Table, Team::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .col(ColumnDef::new(Chat::GameId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Chat::Table, Chat::GameId)
                            .to(Game::Table, Game::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Chat::ChallengeId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Chat::Table, Chat::ChallengeId)
                            .to(Challenge::Table, Challenge::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Chat::Checked).boolean().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Chat::Table).to_owned())
            .await
    }
}

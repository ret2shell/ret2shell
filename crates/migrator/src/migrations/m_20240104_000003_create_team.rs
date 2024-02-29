use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::{m_20240101_000001_create_institute::Institute, m_20240104_000001_create_game::Game};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000003_create_team"
    }
}

#[derive(Iden)]
pub enum Team {
    Table,
    Id,
    Name,
    GameId,
    Token,
    State,
    InstituteId,
    Score,
    History,
    LastActiveAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Team::Table)
                    .col(
                        ColumnDef::new(Team::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Team::Name).string_len(127).not_null())
                    .col(ColumnDef::new(Team::GameId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Team::Table, Team::GameId)
                            .to(Game::Table, Game::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Team::Token).string_len(255).not_null())
                    .col(ColumnDef::new(Team::State).integer().not_null().default(1))
                    .col(ColumnDef::new(Team::InstituteId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Team::Table, Team::InstituteId)
                            .to(Institute::Table, Institute::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .col(ColumnDef::new(Team::Score).integer().not_null().default(0))
                    .col(
                        ColumnDef::new(Team::History)
                            .json_binary()
                            .not_null()
                            .default("[]"),
                    )
                    .col(
                        ColumnDef::new(Team::LastActiveAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Team::Table).to_owned())
            .await
    }
}

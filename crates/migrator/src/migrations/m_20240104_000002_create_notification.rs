use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240104_000001_create_game::Game;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20210101_000005_create_notification"
    }
}

#[derive(Iden)]
pub enum Notification {
    Table,
    Id,
    Title,
    Content,
    PublishedAt,
    GameId,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Notification::Table)
                    .col(
                        ColumnDef::new(Notification::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Notification::Title)
                            .string_len(127)
                            .not_null(),
                    )
                    .col(ColumnDef::new(Notification::Content).text().not_null())
                    .col(
                        ColumnDef::new(Notification::PublishedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(
                        ColumnDef::new(Notification::GameId)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Notification::Table, Notification::GameId)
                            .to(Game::Table, Game::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Notification::Table).to_owned())
            .await
    }
}

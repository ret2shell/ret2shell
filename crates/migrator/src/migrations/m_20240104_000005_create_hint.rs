use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240104_000004_create_challenge::Challenge;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000005_create_hint"
    }
}

#[derive(Iden)]
pub enum Hint {
    Table,
    Id,
    CreatedAt,
    ChallengeId,
    Content,
    Cost,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Hint::Table)
                    .col(
                        ColumnDef::new(Hint::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Hint::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Hint::ChallengeId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Hint::Table, Hint::ChallengeId)
                            .to(Challenge::Table, Challenge::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Hint::Content).text().not_null())
                    .col(ColumnDef::new(Hint::Cost).integer().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Hint::Table).to_owned())
            .await
    }
}

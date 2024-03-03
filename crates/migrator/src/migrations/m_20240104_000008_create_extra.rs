use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::{
    m_20240104_000003_create_team::Team, m_20240104_000004_create_challenge::Challenge,
    m_20240104_000005_create_hint::Hint,
};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000008_create_extra"
    }
}

#[derive(Iden)]
pub enum Extra {
    Table,
    Id,
    CreatedAt,
    Reason,
    Score,
    HintId,
    TeamId,
    ChallengeId,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Extra::Table)
                    .col(
                        ColumnDef::new(Extra::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Extra::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Extra::Reason).text().not_null())
                    .col(ColumnDef::new(Extra::Score).integer().not_null())
                    .col(ColumnDef::new(Extra::HintId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Extra::Table, Extra::HintId)
                            .to(Hint::Table, Hint::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Extra::TeamId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Extra::Table, Extra::TeamId)
                            .to(Team::Table, Team::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Extra::ChallengeId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Extra::Table, Extra::ChallengeId)
                            .to(Challenge::Table, Challenge::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .table(Extra::Table)
                    .col(Extra::TeamId)
                    .col(Extra::ChallengeId)
                    .unique()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Extra::Table).to_owned())
            .await
    }
}

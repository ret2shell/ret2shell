use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::{
    m_20240101_000002_create_user::User, m_20240104_000003_create_team::Team,
    m_20240104_000004_create_challenge::Challenge,
};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000006_create_submission"
    }
}

#[derive(Iden)]
pub enum Submission {
    Table,
    Id,
    CreatedAt,
    UserId,
    TeamId,
    ChallengeId,
    Content,
    Solved,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Submission::Table)
                    .col(
                        ColumnDef::new(Submission::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Submission::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Submission::UserId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Submission::Table, Submission::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(
                        ColumnDef::new(Submission::ChallengeId)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Submission::Table, Submission::ChallengeId)
                            .to(Challenge::Table, Challenge::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Submission::TeamId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Submission::Table, Submission::TeamId)
                            .to(Team::Table, Team::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Submission::Content).text().not_null())
                    .col(ColumnDef::new(Submission::Solved).boolean().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Submission::Table).to_owned())
            .await
    }
}

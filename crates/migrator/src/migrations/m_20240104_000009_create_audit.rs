use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::{
    m_20240101_000002_create_user::User, m_20240104_000003_create_team::Team,
    m_20240104_000004_create_challenge::Challenge,
};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000009_create_audit"
    }
}

#[derive(Iden)]
pub enum Audit {
    Table,
    Id,
    CreatedAt,
    Reason,
    ChallengeId,
    UserId,
    TeamId,
    State, // Confirmed, Pending, Ignored
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Audit::Table)
                    .col(
                        ColumnDef::new(Audit::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Audit::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Audit::Reason).text().not_null())
                    .col(ColumnDef::new(Audit::ChallengeId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Audit::Table, Audit::ChallengeId)
                            .to(Challenge::Table, Challenge::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Audit::UserId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Audit::Table, Audit::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Audit::TeamId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Audit::Table, Audit::TeamId)
                            .to(Team::Table, Team::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Audit::State).integer().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Audit::Table).to_owned())
            .await
    }
}

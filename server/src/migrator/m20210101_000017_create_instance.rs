use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use crate::migrator::{
    m20210101_000002_create_user::User, m20210101_000007_create_challenge::Challenge,
};

use super::m20210101_000008_create_team::Team;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20210101_000017_create_instance"
    }
}

#[derive(Iden)]
pub enum Instance {
    Table,
    Id,
    UserId,
    TeamId,
    ChallengeId,
    StartedAt,
    RenewCount,
    Name,
    Flag,
    Addr,
    Wsrx,
    Running,
}

#[axum::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Instance::Table)
                    .col(
                        ColumnDef::new(Instance::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Instance::Name)
                            .string_len(127)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(Instance::Addr)
                            .string_len(127)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(Instance::Wsrx)
                            .string_len(127)
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Instance::Flag).string_len(255).not_null())
                    .col(
                        ColumnDef::new(Instance::RenewCount)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Instance::StartedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Instance::UserId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Instance::Table, Instance::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .col(ColumnDef::new(Instance::TeamId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Instance::Table, Instance::TeamId)
                            .to(Team::Table, Team::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .col(
                        ColumnDef::new(Instance::ChallengeId)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Instance::Table, Instance::ChallengeId)
                            .to(Challenge::Table, Challenge::Id),
                    )
                    .col(ColumnDef::new(Instance::Running).boolean().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Instance::Table).to_owned())
            .await
    }
}

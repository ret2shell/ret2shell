use sea_orm_migration::prelude::*;

use super::{m_20240101_000002_create_user::User, m_20240104_000003_create_team::Team};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240104_000007_link_team_user"
    }
}

#[derive(Iden)]
pub enum User2Team {
    Table,
    Id,
    UserId,
    TeamId,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(User2Team::Table)
                    .col(
                        ColumnDef::new(User2Team::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(User2Team::UserId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(User2Team::Table, User2Team::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(User2Team::TeamId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(User2Team::Table, User2Team::TeamId)
                            .to(Team::Table, Team::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(User2Team::Table).to_owned())
            .await
    }
}

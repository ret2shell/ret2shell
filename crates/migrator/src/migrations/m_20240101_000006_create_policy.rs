use sea_orm_migration::prelude::*;

use super::m_20240101_000002_create_user::User;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240101_000006_create_policy"
    }
}

#[derive(Iden)]
pub enum Policy {
    Table,
    Id,
    UserId,
    PermType,
    Rule,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Policy::Table)
                    .col(
                        ColumnDef::new(Policy::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Policy::UserId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Policy::Table, Policy::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Policy::PermType).integer().not_null())
                    .col(ColumnDef::new(Policy::Rule).json_binary().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Policy::Table).to_owned())
            .await
    }
}

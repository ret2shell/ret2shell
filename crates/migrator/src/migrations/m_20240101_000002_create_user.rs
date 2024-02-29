use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240101_000001_create_institute::Institute;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240101_000002_create_user"
    }
}

#[derive(Iden)]
pub enum User {
    Table,
    Id,
    RegisteredAt,
    Account,
    Nickname,
    Password,
    Email,
    Description,
    Avatar,
    InstituteId,
    Permissions,
    Hidden,
    Banned,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(User::Table)
                    .col(
                        ColumnDef::new(User::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(User::RegisteredAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(
                        ColumnDef::new(User::Account)
                            .string_len(63)
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(User::Nickname).string_len(63).not_null())
                    .col(ColumnDef::new(User::Password).string_len(127).not_null())
                    .col(
                        ColumnDef::new(User::Email)
                            .string_len(127)
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(User::Description).text())
                    .col(ColumnDef::new(User::Avatar).string_len(255))
                    .col(ColumnDef::new(User::InstituteId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(User::Table, User::InstituteId)
                            .to(Institute::Table, Institute::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .col(ColumnDef::new(User::Permissions).json_binary().not_null())
                    .col(
                        ColumnDef::new(User::Hidden)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(User::Banned)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(User::Table).to_owned())
            .await
    }
}

use sea_orm_migration::prelude::*;

use super::{m_20240101_000001_create_institute::Institute, m_20240101_000002_create_user::User};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240101_000003_create_oauth"
    }
}

#[derive(Iden)]
pub enum Oauth {
    Table,
    Id,
    UserId,
    InstituteId,
    Provider,
    AuthKey,
    Data,
    CreatedAt,
    UpdatedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Oauth::Table)
                    .col(
                        ColumnDef::new(Oauth::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Oauth::UserId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Oauth::Table, Oauth::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Oauth::InstituteId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Oauth::Table, Oauth::InstituteId)
                            .to(Institute::Table, Institute::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .col(ColumnDef::new(Oauth::Provider).string_len(63).not_null())
                    .col(
                        ColumnDef::new(Oauth::AuthKey)
                            .string_len(127)
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Oauth::Data).text())
                    .col(
                        ColumnDef::new(Oauth::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Oauth::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .table(Oauth::Table)
                    .col(Oauth::UserId)
                    .col(Oauth::Provider)
                    .unique()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Oauth::Table).to_owned())
            .await
    }
}

use sea_orm_migration::prelude::*;

use super::{m_20240101_000002_create_user::User, m_20240101_000004_create_ip::Ip};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240101_000005_link_ip_user"
    }
}

#[derive(Iden)]
pub enum User2Ip {
    Table,
    Id,
    UserId,
    IpAddressId,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(User2Ip::Table)
                    .col(
                        ColumnDef::new(User2Ip::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(User2Ip::UserId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(User2Ip::Table, User2Ip::UserId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(
                        ColumnDef::new(User2Ip::IpAddressId)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(User2Ip::Table, User2Ip::IpAddressId)
                            .to(Ip::Table, Ip::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(User2Ip::Table).to_owned())
            .await
    }
}

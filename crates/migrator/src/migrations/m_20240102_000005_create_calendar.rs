use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240101_000002_create_user::User;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240102_000005_create_calendar"
    }
}

#[derive(Iden)]
pub enum Calendar {
    Table,
    Id,
    ReporterId,
    Name,
    Intro,
    Link,
    StartAt,
    EndAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Calendar::Table)
                    .col(
                        ColumnDef::new(Calendar::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Calendar::Name).string_len(63).not_null())
                    .col(ColumnDef::new(Calendar::Intro).text().not_null())
                    .col(ColumnDef::new(Calendar::Link).string_len(511).not_null())
                    .col(
                        ColumnDef::new(Calendar::StartAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(
                        ColumnDef::new(Calendar::EndAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Calendar::ReporterId).big_integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Calendar::Table, Calendar::ReporterId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Calendar::Table).to_owned())
            .await
    }
}

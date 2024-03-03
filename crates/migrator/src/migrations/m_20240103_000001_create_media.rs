use sea_orm_migration::prelude::*;

use super::m_20240101_000002_create_user::User;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240103_000001_create_media"
    }
}

#[derive(Iden)]
pub enum Media {
    Table,
    Id,
    Path,
    Hash,
    UploaderId,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Media::Table)
                    .col(
                        ColumnDef::new(Media::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Media::Path).string_len(255).not_null())
                    .col(
                        ColumnDef::new(Media::Hash)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Media::UploaderId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Media::Table, Media::UploaderId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Media::Table).to_owned())
            .await
    }
}

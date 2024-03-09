use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::m_20240101_000002_create_user::User;
pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240102_000001_create_article"
    }
}

#[derive(Iden)]
pub enum Article {
    Table,
    Id,
    CreatedAt,
    UpdatedAt,
    Title,
    Path,
    Content,
    PublisherId,
    AccessPolicy,
    EnableComment,
    Weight,
    Draft,
    Published,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Article::Table)
                    .col(
                        ColumnDef::new(Article::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Article::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(
                        ColumnDef::new(Article::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Article::Title).string_len(127).not_null())
                    .col(
                        ColumnDef::new(Article::Path)
                            .json_binary()
                            .not_null()
                            .default("[]"),
                    )
                    .col(ColumnDef::new(Article::Content).text())
                    .col(
                        ColumnDef::new(Article::PublisherId)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Article::Table, Article::PublisherId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Article::AccessPolicy).integer().not_null())
                    .col(ColumnDef::new(Article::EnableComment).boolean().not_null())
                    .col(
                        ColumnDef::new(Article::Weight)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(Article::Draft).boolean().not_null())
                    .col(ColumnDef::new(Article::Published).boolean().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Article::Table).to_owned())
            .await
    }
}

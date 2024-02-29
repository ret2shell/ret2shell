use sea_orm_migration::prelude::*;
use sea_query::Keyword::CurrentTimestamp;

use super::{m_20240101_000002_create_user::User, m_20240102_000001_create_article::Article};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240102_000003_create_comment"
    }
}

#[derive(Iden)]
pub enum Comment {
    Table,
    Id,
    CreatedAt,
    ArticleId,
    PublisherId,
    Content,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Comment::Table)
                    .col(
                        ColumnDef::new(Comment::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Comment::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(CurrentTimestamp),
                    )
                    .col(ColumnDef::new(Comment::ArticleId).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Comment::Table, Comment::ArticleId)
                            .to(Article::Table, Article::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(
                        ColumnDef::new(Comment::PublisherId)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Comment::Table, Comment::PublisherId)
                            .to(User::Table, User::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(Comment::Content).text().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Comment::Table).to_owned())
            .await
    }
}

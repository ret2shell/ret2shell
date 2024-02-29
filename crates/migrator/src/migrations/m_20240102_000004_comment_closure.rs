use sea_orm_migration::prelude::*;

use super::m_20240102_000003_create_comment::Comment;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240102_000004_comment_closure"
    }
}

#[derive(Iden)]
pub enum CommentClosure {
    Table,
    Id,
    Ancestor,
    Descendant,
    Depth,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(CommentClosure::Table)
                    .col(
                        ColumnDef::new(CommentClosure::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(CommentClosure::Ancestor)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CommentClosure::Table, CommentClosure::Ancestor)
                            .to(Comment::Table, Comment::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(
                        ColumnDef::new(CommentClosure::Descendant)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CommentClosure::Table, CommentClosure::Descendant)
                            .to(Comment::Table, Comment::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(CommentClosure::Depth).integer().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(CommentClosure::Table).to_owned())
            .await
    }
}

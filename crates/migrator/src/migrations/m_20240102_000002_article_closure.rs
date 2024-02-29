use sea_orm_migration::prelude::*;

use super::m_20240102_000001_create_article::Article;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240102_000002_article_closure"
    }
}

#[derive(Iden)]
pub enum ArticleClosure {
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
                    .table(ArticleClosure::Table)
                    .col(
                        ColumnDef::new(ArticleClosure::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ArticleClosure::Ancestor)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(ArticleClosure::Table, ArticleClosure::Ancestor)
                            .to(Article::Table, Article::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(
                        ColumnDef::new(ArticleClosure::Descendant)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(ArticleClosure::Table, ArticleClosure::Descendant)
                            .to(Article::Table, Article::Id)
                            .on_update(ForeignKeyAction::Cascade)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .col(ColumnDef::new(ArticleClosure::Depth).integer().not_null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ArticleClosure::Table).to_owned())
            .await
    }
}

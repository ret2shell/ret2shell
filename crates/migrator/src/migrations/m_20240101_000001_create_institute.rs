use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20240101_000001_create_institute"
    }
}

#[derive(Iden)]
pub enum Institute {
    Table,
    Id,
    Name,
    Description,
    Logo,
    Provider,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Institute::Table)
                    .col(
                        ColumnDef::new(Institute::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Institute::Name).string_len(127).not_null())
                    .col(ColumnDef::new(Institute::Description).text())
                    .col(ColumnDef::new(Institute::Logo).string_len(127))
                    .col(ColumnDef::new(Institute::Provider).string_len(63))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Institute::Table).to_owned())
            .await
    }
}

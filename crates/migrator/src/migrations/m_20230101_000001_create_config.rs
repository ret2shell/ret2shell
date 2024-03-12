use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m_20210101_000001_create_config"
    }
}

#[derive(Iden)]
pub enum Config {
    Table,
    Id,
    Auditor,
    Auth,
    Automate,
    Bucket,
    Cache,
    Captcha,
    Cluster,
    Database,
    Email,
    Logging,
    Media,
    Queue,
    Server,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Config::Table)
                    .col(
                        ColumnDef::new(Config::Id)
                            .big_integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Config::Auditor).json_binary())
                    .col(ColumnDef::new(Config::Auth).json_binary())
                    .col(ColumnDef::new(Config::Automate).json_binary())
                    .col(ColumnDef::new(Config::Bucket).json_binary())
                    .col(ColumnDef::new(Config::Cache).json_binary())
                    .col(ColumnDef::new(Config::Captcha).json_binary())
                    .col(ColumnDef::new(Config::Cluster).json_binary())
                    .col(ColumnDef::new(Config::Database).json_binary())
                    .col(ColumnDef::new(Config::Email).json_binary())
                    .col(ColumnDef::new(Config::Logging).json_binary())
                    .col(ColumnDef::new(Config::Media).json_binary())
                    .col(ColumnDef::new(Config::Queue).json_binary())
                    .col(ColumnDef::new(Config::Server).json_binary())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Config::Table).to_owned())
            .await
    }
}

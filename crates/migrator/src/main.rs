use std::env;

use sea_orm::ConnectOptions;
use sea_orm_migration::MigratorTrait;

#[tokio::main]
async fn main() {
    let dsn = env::args().nth(1).expect("DSN is required");
    let mut connect_options = ConnectOptions::new(&dsn);
    connect_options.acquire_timeout(std::time::Duration::from_secs(15));

    let conn = sea_orm::Database::connect(connect_options)
        .await
        .expect("Failed to connect to database");
    r2s_migrator::Migrator::up(&conn, None)
        .await
        .expect("Failed to migrate database");
}

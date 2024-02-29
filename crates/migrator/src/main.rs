use std::env;

#[tokio::main]
async fn main() {
    let dsn = env::args().nth(1).expect("DSN is required");
    r2s_migrator::initialize(&dsn)
        .await
        .expect("Failed to initialize database");
}

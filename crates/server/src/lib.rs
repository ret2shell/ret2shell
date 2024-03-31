use std::{io::Write, net::SocketAddr};

use colored::Colorize;
use r2s_config::GlobalConfig;
use rustc_version::version;
use tracing::{error, info, warn};

use crate::traits::GlobalState;

mod logger;
mod middleware;
mod routes;
mod traits;
mod utility;

const PUB_KEY: &[u8] = include_bytes!("../../../config/pub.bin");

/// Show greet information.
pub fn greet() {
    println!(
        "[START UP] {} {}",
        "Ret 2 Shell".bold(),
        format!(
            "{}-{}-{}",
            env!("CARGO_PKG_VERSION"),
            git_version::git_version!(
                args = ["--abbrev=8", "--always", "--dirty=*"],
                fallback = "unknown"
            )
            .to_uppercase(),
            version().unwrap()
        )
        .dimmed()
    );
    println!(
        "----------------------------- {} -----------------------------",
        "server log starts here".to_uppercase().bold()
    );
}

pub async fn up(config: GlobalConfig) -> anyhow::Result<()> {
    let (console_guard, file_guard) = logger::initialize(&config.logging).await?;
    info!(">> Server initialization started <<");
    let license = match r2s_license::check_license(PUB_KEY) {
        Ok(license) => license,
        Err(err) => {
            error!("License check failed: {}", err.to_string().red());
            error!("Please contact tech support <ret2shell@woooo.tech>.");
            return Err(err.into());
        }
    };

    info!(
        "Licensed to {} ({}), will expire at {}",
        license.issuer, license.website, license.date
    );

    info!("Loading module: < Auditor >");
    let auditor = r2s_auditor::initialize(&config.auditor).await?;
    info!("Loading module: < Database >");
    let db = r2s_migrator::initialize(&config.database).await?;
    info!("Loading module: < Cache >");
    let cache = r2s_cache::initialize(&config.cache).await?;
    info!("Loading module: < Message Queue >");
    let queue = r2s_queue::initialize(&config.queue).await?;
    let cluster = r2s_cluster::initialize(&config.cluster).await?;
    info!("Loading module: < Email Worker >");
    r2s_email::initialize(queue.subscribe("email").await?).await?;

    let state = GlobalState {
        config: config.clone(),
        db,
        cache,
        auditor,
        queue,
        license,
        cluster,
    };

    let router = routes::initialize(config.server.clone(), state).await?;
    info!("Router constructed.");

    info!(">> Server initialization finished <<");

    info!("Starting server...");

    let server_config = config
        .server
        .ok_or(anyhow::anyhow!("Server configuration not found."))?;

    let addr_str = format!("{}:{}", &server_config.host, &server_config.port);

    let addr = tokio::net::TcpListener::bind(addr_str.clone())
        .await
        .expect("Failed to bind server address");
    info!("Note: normal HTTP requests will not be logged with level `info` (still can see it with `debug`), you should use a webserver/proxy to monitor the access log.");
    info!("Also, Ret2Shell will not cleanup logs automatically, you should delete them manually or using some sidecar tools.");
    info!("Server started at [ {} ]", addr_str);
    axum::serve(
        addr,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("Failed to start server.");

    drop(console_guard);
    drop(file_guard);
    Ok(())
}

pub async fn down(config: GlobalConfig) -> anyhow::Result<()> {
    println!(
        "{}",
        "WARNING: this operation will drop all your data!"
            .bold()
            .bright_red()
    );
    println!(
        "{}",
        "Please only run it on development server."
            .bold()
            .bright_red()
    );
    print!(
        "Are you sure to continue? [{}/{}]: ",
        "yes".red(),
        "NO".bold().green()
    );
    std::io::stdout().flush()?;
    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;
    if !input.trim().to_lowercase().eq("yes") {
        warn!("Cleanup aborted");
        return Ok(());
    }
    warn!(">> Server cleanup started <<");
    r2s_migrator::down(&config.database).await?;
    info!("Cleanup done: < Database >");
    warn!(">> Server cleanup finished <<");
    Ok(())
}

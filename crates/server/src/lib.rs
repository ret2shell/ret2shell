use std::io::Write;

use colored::Colorize;
use r2s_config::GlobalConfig;
use rustc_version::version;
use tracing::{error, info, warn};

use crate::{traits::GlobalState, utils::adapt_struct};

mod logger;
mod routes;
mod traits;
mod utils;

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
    let (_console_guard, _file_guard) = logger::initialize(
        &config.logging.directory,
        &config.logging.level,
        config.logging.log_to_file,
        config.logging.log_to_console,
    )
    .await?;
    warn!(">> Server initialization started <<");
    let license = match r2s_license::check_license() {
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
    let auditor = match config.audit.clone() {
        Some(auditor) => Some(r2s_auditor::initialize(&auditor.sensitive_word_list).await?),
        None => {
            warn!("Audit module is not configured, will not record any audit log");
            None
        }
    };
    info!("Loading module: < Database >");
    let db = r2s_migrator::initialize(&config.database.dsn()).await?;
    info!("Loading module: < Cache >");
    let cache = r2s_cache::initialize(&config.cache.url).await?;
    info!("Loading module: < Message Queue >");
    let queue = r2s_queue::initialize(
        &config.queue.addr(),
        config.queue.tls,
        config.queue.token.clone(),
        config.queue.user.clone(),
        config.queue.password.clone(),
    )
    .await?;
    let cluster = r2s_cluster::initialize(adapt_struct!(&config.cluster)).await?;
    info!("Loading module: < Email Worker >");
    r2s_email::initialize(queue.subscribe("email").await?).await?;

    let _state = GlobalState {
        config,
        db,
        cache,
        auditor,
        queue,
        license,
        cluster,
    };

    drop(_console_guard);
    drop(_file_guard);
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
    r2s_migrator::down(&config.database.dsn()).await?;
    info!("Cleanup done: < Database >");
    warn!(">> Server cleanup finished <<");
    Ok(())
}

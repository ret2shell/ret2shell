//! This module setup the logger of `tracing`.
//!
//! In the initialization stage, the log writer will be guarded by their file
//! descriptor, the lifetime of the file descriptor is the same as the log
//! writer. You should keep the file descriptor until application exit.

use std::path::Path;

use r2s_config::logging;
use thiserror::Error;
use tracing_appender::{non_blocking, non_blocking::WorkerGuard, rolling};
use tracing_subscriber::{fmt::Layer, prelude::*, EnvFilter};

#[derive(Error, Debug)]
pub enum LoggerError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Initialize the logger.
pub async fn initialize(
    config: &Option<logging::Config>,
) -> Result<(WorkerGuard, WorkerGuard), LoggerError> {
    let config = config.clone().unwrap_or(logging::Config {
        level: "info".to_string(),
        directory: "./log".to_string(),
    });
    let logging::Config { level, directory } = config;
    tokio::fs::create_dir_all(&directory).await?;
    let file_appender = rolling::daily(Path::new(&directory).canonicalize()?, "ret2shell.log");
    // println!("log config: {:?}", config.logging);

    let (non_blocking_file, _file_guard) = non_blocking(file_appender);
    let (non_blocking_console, _console_guard) = non_blocking(std::io::stdout());
    let file_log_layer = Layer::new()
        .with_writer(non_blocking_file)
        .with_ansi(false)
        .with_target(true)
        .with_level(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .json();

    let console_log_layer = Layer::new()
        .with_writer(non_blocking_console)
        .with_ansi(true)
        .with_target(true)
        .with_level(true)
        .with_thread_ids(false)
        .with_thread_names(false);

    tracing_subscriber::registry()
        .with(EnvFilter::new(level))
        .with(file_log_layer)
        .with(console_log_layer)
        .init();

    Ok((_console_guard, _file_guard))
}

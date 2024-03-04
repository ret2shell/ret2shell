//! The configuration for logging in the application.
use serde::{Deserialize, Serialize};

/// `LoggingConfig` represents the configuration for logging in the application.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    /// `directory` is the path to the directory where log files will be stored.
    pub directory: String,
    /// `level` is the minimum log level that will be recorded (e.g., "info",
    /// "debug", "error").
    pub level: String,
    /// `log_to_file` is a boolean flag indicating whether logs should be
    /// written to a file.
    pub log_to_file: bool,
    /// `log_to_console` is a boolean flag indicating whether logs should be
    /// printed to the console.
    pub log_to_console: bool,
}

//! Audit configuration.

use serde::{Deserialize, Serialize};

/// Represents the configuration for auditing in the application.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditorConfig {
    /// path to sensitive word list
    pub sensitive_word_list: Option<String>,
}

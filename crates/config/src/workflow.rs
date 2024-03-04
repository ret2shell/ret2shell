/// Configuration for workflow settings.
use serde::{Deserialize, Serialize};

/// `WorkflowConfig` is a configuration struct for managing workflow settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    /// the maximum number of workers for the workflow.
    pub max_workers: usize,
    /// container image push registry.
    pub registry: String,
}

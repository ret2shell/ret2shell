/// Configuration for service settings.
use serde::{Deserialize, Serialize};

/// `ClusterConfig` is a configuration struct for managing service settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterConfig {
    /// `try_default` is a flag to try to use the default service account.
    /// maybe useful when running ret2shell inside a kubernetes cluster,
    /// and want to use the same cluster to launch challenge pods.
    pub try_default: bool,
    /// `auto_infer` is a flag to try to infer the kube config path.
    /// only available when `try_default` is false.
    pub auto_infer: bool,
    /// `kube_config_path` is the path to the kube config file.
    /// necessary when `try_default` and `auto_infer` both are false.
    pub kube_config_path: Option<String>,
    /// `challenge_node_selector` is the node selector for challenge pods.
    /// it will be used as `ret2shellType=<challenge_node_selector>`,
    /// you should setup the node selector in your kubernetes cluster first.
    pub challenge_node_selector: Option<String>,
}

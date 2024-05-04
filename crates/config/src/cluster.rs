use sea_orm::FromJsonQueryResult;
/// Configuration for service settings.
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

/// `ClusterConfig` is a configuration struct for managing service settings.
#[derive(Serialize, Deserialize, Clone, Debug, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
    pub enabled: bool,
    /// `try_default` is a flag to try to use the default service account.
    /// maybe useful when running ret2shell inside a kubernetes cluster,
    /// and want to use the same cluster to launch challenge pods.
    pub try_default: Option<bool>,
    /// `auto_infer` is a flag to try to infer the kube config path.
    /// only available when `try_default` is false.
    pub auto_infer: Option<bool>,
    /// `kube_config_path` is the path to the kube config file.
    /// necessary when `try_default` and `auto_infer` both are false.
    pub kube_config_path: Option<String>,
    /// `challenge_node_selector` is the node selector for challenge pods.
    /// it will be used as `ret2shellType=<challenge_node_selector>`,
    /// you should setup the node selector in your kubernetes cluster first.
    pub challenge_node_selector: Option<String>,
    /// `proxy_image` is the image for the proxy container.
    pub proxy_image: Option<String>,
    /// `traffic` is the traffic backend, default to `wsrx`.
    pub traffic: Option<String>,
    /// `enable_capture` is a flag to enable the stream capture feature.
    pub enable_capture: Option<bool>,
    /// `capture_directory` is the directory to store the capture files.
    pub capture_directory: Option<String>,
    /// `cleanup_interval` is the interval in seconds to cleanup outdated pods.
    pub cleanup_interval: Option<u64>,
}

impl Merge for Option<Config> {
    fn merge(self, other: Self) -> Self {
        // prefers fields in `other`
        match (self, other) {
            (Some(a), Some(b)) => Some(Config {
                enabled: b.enabled,
                try_default: b.try_default.or(a.try_default),
                auto_infer: b.auto_infer.or(a.auto_infer),
                kube_config_path: b.kube_config_path.or(a.kube_config_path),
                challenge_node_selector: b.challenge_node_selector.or(a.challenge_node_selector),
                proxy_image: b.proxy_image.or(a.proxy_image),
                traffic: b.traffic.or(a.traffic),
                enable_capture: b.enable_capture.or(a.enable_capture),
                capture_directory: b.capture_directory.or(a.capture_directory),
                cleanup_interval: b.cleanup_interval.or(a.cleanup_interval),
            }),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        }
    }
}

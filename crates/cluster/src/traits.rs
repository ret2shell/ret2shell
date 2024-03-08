use chrono::{
    serde::{ts_seconds, ts_seconds_option},
    DateTime, Utc,
};
use num_derive::{FromPrimitive, ToPrimitive};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ClusterError {
    #[error("kube error: {0}")]
    KubeError(#[from] kube::Error),
    #[error("failed to infer config: {0}")]
    InferConfigError(#[from] kube::config::InferConfigError),
    #[error("failed to load kube config: {0}")]
    KubeConfigError(#[from] kube::config::KubeconfigError),
    #[error("need declare namespace: {0}")]
    NeedNamespace(String),
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerConfig {
    pub image: String,
    pub cpu: String,
    pub memory: String,
    pub storage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceConfig {
    containers: Vec<ContainerConfig>,
    port: u16,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Eq,
    PartialOrd,
    Serialize_repr,
    Deserialize_repr,
    FromPrimitive,
    ToPrimitive,
)]
#[repr(i32)]
pub enum State {
    #[default]
    Pending = 0,
    Running = 1,
    Succeeded = 2,
    Failed = 3,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub name: String,
    pub inner_addr: String,
    pub state: State,
    pub config: InstanceConfig,
    #[serde(with = "ts_seconds_option")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(with = "ts_seconds")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "ts_seconds_option")]
    pub stoped_at: Option<DateTime<Utc>>,
}

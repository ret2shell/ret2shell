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
    #[error("cluster config is needed")]
    ConfigNeeded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerConfig {
    pub image: String,
    pub cpu: String,
    pub memory: String,
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

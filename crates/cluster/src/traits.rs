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
    #[error("cluster is disabled")]
    ClusterDisabled,
}

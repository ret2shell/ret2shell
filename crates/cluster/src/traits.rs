use r2s_engine::EngineError;
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
  #[error("pod not found: {0}")]
  PodNotFound(String),
  #[error("proxy error: {0}")]
  ProxyError(#[from] wsrx::Error),
  #[error("missing field: {0}")]
  MissingField(String),
  #[error("network error: {0}")]
  NetworkError(#[from] reqwest::Error),
  #[error("json error: {0}")]
  JsonError(#[from] serde_json::Error),
  #[error("io error: {0}")]
  IoError(#[from] std::io::Error),
  #[error("upload to registry failed: {0}")]
  UploadFailed(String),
  #[error("registry sync failed: {0}")]
  RegistrySyncFailed(String),
  #[error("registry digest not found: {0}")]
  RegistryDigestMissing(String),
  #[error("renew exceed limit: {0}")]
  PodRenewExceedLimit(String),
  #[error("invalid image file type: {0}")]
  InvalidImageFileType(String),
  #[error("path traversal detected: {0}")]
  PathTraversalDetected(String),
  #[error("engine error: {0}")]
  EngineError(#[from] EngineError),
  #[error("traffic-mapper not found: {0}")]
  TrafficMapperNotFound(String),
}

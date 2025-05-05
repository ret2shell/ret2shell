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
  #[error("renew exceed limit: {0}")]
  PodRenewExceedLimit(String),
  #[error("invalid image file type: {0}")]
  InvalidImageFileType(String),
  #[error("path traversal detected: {0}")]
  PathTraversalDetected(String),
  #[error("Rune context error: {0}")]
  RuneError(#[from] rune::ContextError),
  #[error("Rune runtime error: {0}")]
  RuneRuntimeError(#[from] rune::runtime::RuntimeError),
  #[error("Can not load script source: {0}")]
  SourceError(#[from] rune::source::FromPathError),
  #[error("Can not build script unit: {0}")]
  BuildError(#[from] rune::BuildError),
  #[error("Can not alloc script engine runtime: {0}")]
  AllocError(#[from] rune::alloc::Error),
  #[error("Executed script error: {0}")]
  ExecError(#[from] rune::runtime::VmError),
  #[error("Compile error: {0}")]
  CompileError(String),
  #[error("Missing function: {0}")]
  MissingFunction(String),
  #[error("Failed to emit diagnostics: {0}")]
  DiagnosticsError(#[from] rune::diagnostics::EmitError),
  #[error("String UTF-8 decode error: {0}")]
  FromUtf8Error(#[from] std::string::FromUtf8Error),
  #[error("script error: {0}")]
  ScriptError(String),
  #[error("Traffic port-mapping not found: {0}")]
  TrafficMapperNotFound(String),
}

use std::collections::HashMap;

use rune::Any;
use serde_json::Value;
use thiserror::Error;

#[derive(Error, Debug, Any)]
#[rune(item = ::ret2shell::oauth)]
pub enum OAuthError {
  #[error("missing oauth field: {0}")]
  MissingField(String),
  #[error("xml parse error: {0}")]
  XmlParseError(#[from] roxmltree::Error),
  #[error("network error: {0}")]
  NetworkError(#[from] reqwest::Error),
  #[error("adapter unavailable: {0}")]
  AdapterUnavailable(String),
  #[error("invalid email: {0}")]
  InvalidEmail(String),
  #[error("Rune context error: {0}")]
  RuneError(#[from] rune::ContextError),
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
  #[error("serde error: {0}")]
  SerdeError(#[from] serde_json::Error),
}

#[async_trait::async_trait]
pub trait OAuthProvider {
  /// login to oauth account
  ///
  /// # returns
  ///
  /// * `Ok((auth_key, data))` - auth_key is the unique key for the oauth
  ///   account, data is the user data
  async fn login(
    &self, account: &str, email: &str, query: HashMap<String, String>,
  ) -> Result<(String, Value), OAuthError>;
}

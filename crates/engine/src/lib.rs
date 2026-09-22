mod traits;
mod utils;

use std::{
  collections::{HashMap, HashSet},
  sync::Arc,
};

use chrono::{DateTime, Utc};
use rune::{
  Context, Diagnostics, Source, Unit, Value, Vm,
  runtime::{Args, RuntimeContext},
};
use tokio::sync::RwLock;
use tracing::{debug, trace};
pub use traits::*;

use crate::utils::diagnostic_to_marker;

type EngineContext = (Arc<Unit>, Arc<RuntimeContext>, DateTime<Utc>);

/// Parse a Rune script value according to the function's return contract.
pub fn parse_value<T>(value: Value, expected: impl Into<String>) -> Result<T, EngineError>
where
  T: rune::FromValue, {
  let actual = value.type_info();
  rune::from_value(value).map_err(|_| EngineError::InvalidReturnType {
    expected: expected.into(),
    actual: actual.to_string(),
  })
}

/// Convert a Rune script error value into the caller's error type.
pub fn script_error_from_value<E>(error: Value) -> E
where
  E: From<EngineError>, {
  let message = match rune::from_value::<String>(error.clone()) {
    Ok(message) => message,
    Err(_) => serde_json::to_string(&error)
      .unwrap_or_else(|_| format!("got a non-serializable `{}` error value", error.type_info())),
  };
  EngineError::ScriptError(message).into()
}

#[derive(Clone, Debug, Default)]
pub struct Engine {
  contexts: Arc<RwLock<HashMap<String, EngineContext>>>,
}

impl Engine {
  async fn build_context<M>(modules: Vec<M>) -> Result<Context, EngineError>
  where
    M: Fn(bool) -> Result<rune::Module, rune::ContextError>, {
    let mut context = Context::with_default_modules()?;
    for module in modules {
      context.install(module(true)?)?;
    }
    Ok(context)
  }

  pub async fn lint<M>(
    modules: Vec<M>, script: impl AsRef<str>, required_funcs: &[&'static str],
  ) -> Result<Vec<DiagnosticMarker>, EngineError>
  where
    M: Fn(bool) -> Result<rune::Module, rune::ContextError>, {
    let script = script.as_ref();
    trace!(?script, "linting script");
    let context = Self::build_context(modules).await?;
    let mut sources = rune::Sources::new();
    sources.insert(Source::memory(script)?)?;
    let mut diagnostics = Diagnostics::new();
    let result = rune::prepare(&mut sources)
      .with_context(&context)
      .with_diagnostics(&mut diagnostics)
      .build();

    let mut markers_set: HashSet<String> = HashSet::new();
    let mut markers: Vec<DiagnosticMarker> = Vec::new();

    for diagnostic in diagnostics.diagnostics() {
      if let Some(marker) = diagnostic_to_marker(diagnostic, &sources) {
        let key = format!(
          "{:?}:{:?}:{:?}",
          marker.kind, marker.message, marker.start_line
        );
        if markers_set.insert(key) {
          markers.push(marker);
        }
      }
    }

    let unit = match result {
      Ok(unit) => unit,
      Err(error) => {
        if markers.is_empty() {
          markers.push(DiagnosticMarker {
            kind: DiagnosticKind::Error,
            message: format!("script failed to compile: {}", error),
            start_line: 0,
            start_column: 0,
            end_line: 0,
            end_column: 0,
          });
        }
        debug!(?markers, "script failed to compile");
        return Ok(markers);
      }
    };

    let runtime = context.runtime()?;
    let vm = Vm::new(Arc::new(runtime), Arc::new(unit));

    for func in required_funcs {
      if vm.lookup_function([func]).is_err() {
        let msg = format!(
          "missing required function: {} (entry functions must be declared as `pub fn`)",
          func
        );
        if markers_set.insert(msg.clone()) {
          markers.push(DiagnosticMarker {
            kind: DiagnosticKind::Error,
            message: msg,
            start_line: 0,
            start_column: 0,
            end_line: 0,
            end_column: 0,
          });
        }
      }
    }
    debug!(?markers, "script linted successfully");

    Ok(markers)
  }

  pub async fn expire(&self, key: impl AsRef<str>) {
    self.contexts.write().await.remove(key.as_ref());
  }

  pub async fn preload(
    &self, modules: Vec<impl Fn(bool) -> Result<rune::Module, rune::ContextError>>,
    key: impl AsRef<str>, script: impl AsRef<str>, changed_at: Option<DateTime<Utc>>,
  ) -> Result<(), EngineError> {
    let contexts = self.contexts.read().await;
    if let Some(changed_at) = changed_at
      && let Some((_, _, compiled_at)) = contexts.get(key.as_ref())
      && *compiled_at >= changed_at
    {
      debug!(key = key.as_ref(), "script is up-to-date, skipping preload");
      return Ok(());
    } else if contexts.contains_key(key.as_ref()) && changed_at.is_none() {
      debug!(
        key = key.as_ref(),
        "script is already loaded, skipping preload"
      );
      return Ok(());
    }
    drop(contexts);
    let key = key.as_ref().to_string();
    let script = script.as_ref();
    debug!(?key, ?script, "preloading script");
    let context = Self::build_context(modules).await?;
    let mut sources = rune::Sources::new();
    sources.insert(Source::memory(script)?)?;
    let unit = rune::prepare(&mut sources).with_context(&context).build()?;

    let runtime = context.runtime()?;
    let now = Utc::now();
    self
      .contexts
      .write()
      .await
      .insert(key, (Arc::new(unit), Arc::new(runtime), now));
    Ok(())
  }

  pub async fn execute(
    &self, key: impl AsRef<str>, func: &'static str, args: impl Args + Send,
  ) -> Result<Value, EngineError> {
    let key = key.as_ref();
    debug!(?key, ?func, "executing script function");
    let contexts = self.contexts.read().await;
    let (unit, runtime, _) = contexts
      .get(key)
      .ok_or_else(|| EngineError::MissingCheckerScript(key.to_string()))?;
    let vm = Vm::new(runtime.clone(), unit.clone());
    let result = vm.send_execute([func], args)?;
    let result = result.async_complete().await.into_result()?;

    Ok(result)
  }

  /// Execute a Rune function and parse its output according to the function's
  /// return contract.
  pub async fn execute_as<T>(
    &self, key: impl AsRef<str>, func: &'static str, args: impl Args + Send,
    expected: impl Into<String>,
  ) -> Result<T, EngineError>
  where
    T: rune::FromValue, {
    parse_value(self.execute(key, func, args).await?, expected)
  }

  pub async fn has_function(
    &self, key: impl AsRef<str>, func: &'static str,
  ) -> Result<bool, EngineError> {
    let key = key.as_ref();
    let contexts = self.contexts.read().await;
    let (unit, runtime, _) = contexts
      .get(key)
      .ok_or_else(|| EngineError::MissingCheckerScript(key.to_string()))?;
    let vm = Vm::new(runtime.clone(), unit.clone());
    Ok(vm.lookup_function([func]).is_ok())
  }

  pub async fn cleanup(&self) {
    let now = Utc::now();
    let mut contexts = self.contexts.write().await;
    debug!(count = contexts.len(), "cleaning up engine contexts");
    contexts.retain(|_, (_, _, time)| {
      let duration = now.signed_duration_since(*time);
      duration.num_hours() < 1
    });
    debug!(count = contexts.len(), "cleanup complete");
  }

  pub fn spawn_cleanup_worker(&self) {
    let engine = self.clone();
    tokio::spawn(async move {
      engine.cleanup_worker().await;
    });
  }

  pub async fn cleanup_worker(&self) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
    loop {
      interval.tick().await;
      self.cleanup().await;
    }
  }
}

pub fn initialize() -> Engine {
  let engine = Engine::default();
  engine.spawn_cleanup_worker();
  engine
}

#[cfg(test)]
mod tests {
  use super::{DiagnosticKind, Engine, EngineError, parse_value, script_error_from_value};

  fn modules() -> Vec<fn(bool) -> Result<rune::Module, rune::ContextError>> {
    vec![rune_modules::json::module]
  }

  /// NOTE: rune only registers `pub` functions in the unit's root item, so
  /// scripts must declare their entry points as `pub fn` to be callable.
  const ADD_SCRIPT: &str = "pub fn add(a, b) { a + b }";
  const PRIVATE_ADD_SCRIPT: &str = "fn add(a, b) { a + b }";

  #[tokio::test]
  async fn lint_accepts_script_with_all_required_functions() {
    let markers = Engine::lint(modules(), ADD_SCRIPT, &["add"]).await.unwrap();
    assert!(markers.is_empty(), "unexpected markers: {markers:?}");
  }

  #[tokio::test]
  async fn lint_reports_each_missing_required_function() {
    let markers = Engine::lint(modules(), "fn other() { 1 }", &["check", "environ"])
      .await
      .unwrap();

    for required in ["check", "environ"] {
      assert!(
        markers.iter().any(|m| m
          .message
          .contains(&format!("missing required function: {required}"))),
        "missing marker for `{required}`: {markers:?}"
      );
    }
  }

  #[tokio::test]
  async fn lint_flags_non_public_entry_points_as_missing() {
    // rune only exposes `pub` functions through the unit's function table, so
    // a private entry point is indistinguishable from an absent one.
    let markers = Engine::lint(modules(), PRIVATE_ADD_SCRIPT, &["add"])
      .await
      .unwrap();
    assert!(
      markers
        .iter()
        .any(|m| m.message.contains("missing required function: add")),
      "markers: {markers:?}"
    );
  }

  #[tokio::test]
  async fn lint_reports_compile_error_with_source_position() {
    let markers = Engine::lint(modules(), "fn broken( { 1 }", &[])
      .await
      .unwrap();

    assert!(!markers.is_empty());
    let error = markers
      .iter()
      .find(|m| matches!(m.kind, DiagnosticKind::Error))
      .expect("compile failure should produce an error marker");
    // a compile diagnostic carries the real position, not the fallback at 0:0
    assert!(error.start_line > 0 || !error.message.contains("failed to compile"));
  }

  #[tokio::test]
  async fn execute_runs_preloaded_script_functions() {
    let engine = Engine::default();
    engine
      .preload(modules(), "test-add", ADD_SCRIPT, None)
      .await
      .unwrap();

    assert!(engine.has_function("test-add", "add").await.unwrap());
    assert!(!engine.has_function("test-add", "sub").await.unwrap());

    let value = engine.execute("test-add", "add", (21, 21)).await.unwrap();
    assert_eq!(parse_value::<i64>(value, "an integer").unwrap(), 42);
    assert_eq!(
      engine
        .execute_as::<i64>("test-add", "add", (1, -1), "an integer")
        .await
        .unwrap(),
      0
    );
  }

  #[tokio::test]
  async fn execute_without_preload_reports_missing_script() {
    let engine = Engine::default();
    let err = engine
      .execute("never-loaded", "add", (1, 2))
      .await
      .unwrap_err();
    assert!(matches!(err, EngineError::MissingCheckerScript(key) if key == "never-loaded"));

    let err = engine
      .has_function("never-loaded", "add")
      .await
      .unwrap_err();
    assert!(matches!(err, EngineError::MissingCheckerScript(_)));
  }

  #[tokio::test]
  async fn expire_drops_preloaded_context() {
    let engine = Engine::default();
    engine
      .preload(modules(), "test-expire", ADD_SCRIPT, None)
      .await
      .unwrap();
    engine.expire("test-expire").await;

    let err = engine
      .execute("test-expire", "add", (1, 2))
      .await
      .unwrap_err();
    assert!(matches!(err, EngineError::MissingCheckerScript(_)));
  }

  #[tokio::test]
  async fn cleanup_keeps_recently_compiled_contexts() {
    let engine = Engine::default();
    engine
      .preload(modules(), "test-cleanup", ADD_SCRIPT, None)
      .await
      .unwrap();

    engine.cleanup().await;

    assert_eq!(
      engine
        .execute_as::<i64>("test-cleanup", "add", (2, 3), "an integer")
        .await
        .unwrap(),
      5
    );
  }

  #[test]
  fn parse_value_reports_expected_and_actual_types() {
    let value = rune::to_value("a string".to_owned()).unwrap();
    let err = parse_value::<i64>(value, "an integer").unwrap_err();

    match err {
      EngineError::InvalidReturnType { expected, actual } => {
        assert_eq!(expected, "an integer");
        assert!(actual.to_lowercase().contains("string"), "actual: {actual}");
      }
      other => panic!("expected InvalidReturnType, got {other:?}"),
    }

    let value = rune::to_value(7i64).unwrap();
    assert_eq!(parse_value::<i64>(value, "an integer").unwrap(), 7);
  }

  #[test]
  fn script_error_from_value_wraps_string_values_verbatim() {
    let error = rune::to_value("flag is wrong".to_owned()).unwrap();
    let err: EngineError = script_error_from_value(error);

    assert!(matches!(err, EngineError::ScriptError(msg) if msg == "flag is wrong"));
  }
}

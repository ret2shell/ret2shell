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
        let msg = format!("missing required function: {}", func);
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

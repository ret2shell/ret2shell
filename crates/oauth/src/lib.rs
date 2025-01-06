pub mod traits;
mod utility;
use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use r2s_config::auth::Config;
use rune::{
  runtime::{Object, RuntimeContext},
  termcolor::Buffer,
  Any, Context, ContextError, Diagnostics, Module, Source, Sources, Unit, Value, Vm,
};
use tokio::sync::RwLock;
pub use traits::OAuthError;

#[derive(Clone, Debug, Any)]
#[rune(item = ::ret2shell::oauth)]
pub struct RuneMap(pub HashMap<String, String>);

impl RuneMap {
  #[rune::function(path = Self::get)]
  pub fn get(&self, key: &str) -> Option<String> {
    self.0.get(key).cloned()
  }
}

#[rune::module(::ret2shell::oauth)]
pub fn module() -> Result<Module, ContextError> {
  let mut module = Module::from_meta(self::module_meta)?;
  module.ty::<RuneMap>()?;
  module.function_meta(RuneMap::get)?;
  Ok(module)
}

type OAuthContext = (Arc<Unit>, Arc<RuntimeContext>, DateTime<Utc>);

#[derive(Debug, Clone, Default)]
pub struct OAuth {
  contexts: Arc<RwLock<HashMap<String, OAuthContext>>>,
}

impl OAuth {
  async fn build_context() -> Result<Context, OAuthError> {
    let mut context = rune::Context::with_default_modules()?;
    context.install(rune_modules::http::module(true)?)?;
    context.install(rune_modules::json::module(true)?)?;
    context.install(rune_modules::toml::module(true)?)?;
    context.install(rune_modules::process::module(true)?)?;
    context.install(utility::xml::module(true)?)?;
    context.install(module()?)?;
    Ok(context)
  }

  pub async fn expire(&self, key: &str) {
    self.contexts.write().await.remove(key);
  }

  pub async fn preload(&self, key: &str, script: &str) -> Result<(), OAuthError> {
    let mut contexts = self.contexts.write().await;
    if contexts.contains_key(key) {
      return Ok(());
    }
    let context = Self::build_context().await?;
    let mut sources = rune::Sources::new();
    sources.insert(rune::Source::memory(script)?)?;

    let unit = rune::prepare(&mut sources).with_context(&context).build()?;
    let runtime = context.runtime()?;

    contexts.insert(
      key.to_string(),
      (Arc::new(unit), Arc::new(runtime), Utc::now()),
    );
    Ok(())
  }

  pub async fn lint(&self, script: &str) -> Result<(), OAuthError> {
    let context = Self::build_context().await?;
    let mut sources = Sources::new();
    sources.insert(Source::memory(script)?)?;
    let mut diagnostics = Diagnostics::new();
    let _ = rune::prepare(&mut sources)
      .with_context(&context)
      .with_diagnostics(&mut diagnostics)
      .build();
    if !diagnostics.is_empty() {
      let mut out = Buffer::ansi();
      diagnostics.emit(&mut out, &sources)?;
      return Err(OAuthError::CompileError(
        (String::from_utf8(out.into_inner())?).to_string(),
      ));
    }
    let unit = rune::prepare(&mut sources).with_context(&context).build()?;
    let runtime = context.runtime()?;
    let vm = Vm::new(Arc::new(runtime), Arc::new(unit));
    vm.lookup_function(["login"])
      .map_err(|_| OAuthError::MissingFunction("login".to_owned()))?;

    vm.lookup_function(["bind"])
      .map_err(|_| OAuthError::MissingFunction("bind".to_owned()))?;

    Ok(())
  }

  pub async fn login(
    &self, key: &str, params: &HashMap<String, String>,
  ) -> Result<HashMap<String, String>, OAuthError> {
    let contexts = self.contexts.read().await;
    let (unit, runtime, _) = contexts.get(key).ok_or_else(|| {
      OAuthError::MissingField(format!("oauth provider not found for key: {}", key))
    })?;
    let vm = Vm::new(runtime.clone(), unit.clone());
    let params_object = RuneMap(params.clone());
    let result = vm.send_execute(["login"], (params_object,))?;
    let result = result.async_complete().await.into_result()?;
    let output: Result<Object, Value> = rune::from_value(result)?;
    if let Ok(object) = output {
      let _ = object
        .get("auth_key")
        .ok_or_else(|| OAuthError::MissingField("auth_key".to_owned()))?;
      let mut data: HashMap<String, String> = HashMap::new();
      for (key, value) in object.iter() {
        data.insert(key.to_string(), rune::from_value(value.clone())?);
      }
      Ok(data)
    } else {
      Err(OAuthError::ScriptError(
        "unexpected value in oauth script".to_owned(),
      ))
    }
  }

  pub async fn bind(
    &self, key: &str, params: &HashMap<String, String>, user: &HashMap<String, String>,
  ) -> Result<HashMap<String, String>, OAuthError> {
    let contexts = self.contexts.read().await;
    let (unit, runtime, _) = contexts.get(key).ok_or_else(|| {
      OAuthError::MissingField(format!("oauth provider not found for key: {}", key))
    })?;
    let vm = Vm::new(runtime.clone(), unit.clone());
    let params_object = RuneMap(params.clone());
    let user_object = RuneMap(user.clone());
    let result = vm.send_execute(["bind"], (params_object, user_object))?;
    let result = result.async_complete().await.into_result()?;
    let output: Result<Object, Value> = rune::from_value(result)?;
    if let Ok(object) = output {
      let _ = object
        .get("auth_key")
        .ok_or_else(|| OAuthError::MissingField("auth_key".to_owned()))?;
      let mut data: HashMap<String, String> = HashMap::new();
      for (key, value) in object.iter() {
        data.insert(key.to_string(), rune::from_value(value.clone())?);
      }
      Ok(data)
    } else {
      Err(OAuthError::ScriptError(
        "unexpected value in oauth script".to_owned(),
      ))
    }
  }

  pub async fn cleanup(&mut self) {
    let now = Utc::now();
    self.contexts.write().await.retain(|_, (_, _, time)| {
      let duration = now.signed_duration_since(*time);
      duration.num_hours() < 1
    });
  }

  pub async fn cleanup_worker(&mut self) {
    loop {
      tokio::time::sleep(tokio::time::Duration::from_secs(15 * 60)).await;
      tracing::debug!("Running oauth provider scripts cleanup...");
      self.cleanup().await;
      tracing::trace!(
        "Live oauth providers: {:?}",
        self.contexts.read().await.keys()
      );
    }
  }
}

pub async fn initialize(_config: &Option<Config>) -> OAuth {
  let client = OAuth::default();
  let mut client_worker = client.clone();
  tokio::spawn(async move {
    client_worker.cleanup_worker().await;
  });
  client
}

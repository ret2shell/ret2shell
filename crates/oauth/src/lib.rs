pub mod traits;
mod utility;
use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use r2s_config::auth::Config;
use r2s_database::{oauth, user};
use rune::{
  alloc,
  runtime::{Object, RuntimeContext},
  termcolor::Buffer,
  Context, Diagnostics, Source, Sources, Unit, Value, Vm,
};
use tokio::sync::RwLock;
use tracing::debug;
pub use traits::OAuthError;

type OAuthContext = (Arc<Unit>, Arc<RuntimeContext>, DateTime<Utc>);
macro_rules! to_rune_object {
    ($model:tt, $($column:tt), *) => {
        {
            let mut object = Object::new();
            $(
                object.insert(alloc::String::try_from(stringify!($column))?, rune::to_value($model.$column.clone())?)?;
            )*
            object
        }
    };
}
#[derive(Debug, Clone)]
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

    Ok(())
  }

  pub async fn login(
    &self, key: &str, user: &user::Model, params: &HashMap<String, String>,
  ) -> Result<oauth::Model, OAuthError> {
    let contexts = self.contexts.read().await;
    debug!("Login user {user:?} with params: {params:?}");
    let (unit, runtime, _) = contexts.get(key).ok_or_else(|| {
      OAuthError::MissingField(format!("oauth provider not found for key: {}", key))
    })?;
    let mut vm = Vm::new(runtime.clone(), unit.clone());
    let mut params_object = Object::new();
    let user_object = to_rune_object!(user, id, account, institute_id, email, nickname);
    for (key, value) in params.iter() {
      params_object.insert(
        alloc::String::try_from(key.as_str())?,
        rune::to_value(value.clone())?,
      )?;
    }
    let result = vm.call(["login"], (user_object, params_object))?;
    let output: Result<Object, Value> = rune::from_value(result)?;
    if let Ok(object) = output {
      let auth_key = object
        .get("auth_key")
        .ok_or_else(|| OAuthError::MissingField("auth_key".to_owned()))?;
      let mut data : HashMap<String, String> = HashMap::new();
      for (key, value) in object.iter() {
        if key != "auth_key" {
          data.insert(key.clone(), rune::from_value(value.clone())?);
        }
      }
      Ok(oauth::Model {
        id: 0,
        user_id: user.id,
        provider: key.to_string(),
        auth_key: auth_key.(),
        data: serde_json::to_value(data)?,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        institute_id: None,
      })
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
  OAuth {}
}

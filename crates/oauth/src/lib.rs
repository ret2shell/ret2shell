pub mod traits;
mod utility;
use std::collections::HashMap;

use r2s_config::auth::Config;
use r2s_engine::{DiagnosticMarker, Engine, EngineError, parse_value, script_error_from_value};
use rune::{Any, ContextError, Module, Value, runtime::Object};
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
pub fn module(_stdio: bool) -> Result<Module, ContextError> {
  let mut module = Module::from_meta(self::module_meta)?;
  module.ty::<RuneMap>()?;
  module.function_meta(RuneMap::get)?;
  Ok(module)
}

fn parse_output(output: Result<Value, Value>) -> Result<HashMap<String, String>, OAuthError> {
  let value = match output {
    Ok(value) => value,
    Err(error) => return Err(script_error_from_value(error)),
  };
  let object: Object = parse_value(value, "`Object` inside `Ok`")?;
  let _ = object
    .get("auth_key")
    .ok_or_else(|| OAuthError::MissingField("auth_key".to_owned()))?;
  let mut data = HashMap::new();
  for (key, value) in object.iter() {
    data.insert(
      key.to_string(),
      parse_value(value.clone(), format!("a `String` value for `{key}`"))?,
    );
  }
  Ok(data)
}

#[derive(Debug, Clone, Default)]
pub struct OAuth;

impl OAuth {
  fn default_modules() -> Vec<fn(bool) -> Result<rune::Module, rune::ContextError>> {
    vec![
      rune_modules::http::module,
      rune_modules::json::module,
      rune_modules::toml::module,
      rune_modules::process::module,
      utility::xml::module,
      module,
    ]
  }

  pub async fn expire(&self, engine: &Engine, key: impl AsRef<str>) {
    engine.expire(format!("oauth-{}", key.as_ref())).await;
  }

  pub async fn preload(
    &self, engine: &Engine, key: impl AsRef<str>, script: impl AsRef<str>,
  ) -> Result<(), EngineError> {
    let key = format!("oauth-{}", key.as_ref());
    engine
      .preload(Self::default_modules(), key, script, None)
      .await
  }

  pub async fn lint(&self, script: impl AsRef<str>) -> Result<Vec<DiagnosticMarker>, EngineError> {
    Engine::lint(Self::default_modules(), script, &["login", "bind"]).await
  }

  pub async fn login(
    &self, engine: &Engine, key: impl AsRef<str>, params: &HashMap<String, String>,
  ) -> Result<HashMap<String, String>, OAuthError> {
    let key = key.as_ref();
    let key = format!("oauth-{}", key);
    let params_object = RuneMap(params.clone());
    let output: Result<Value, Value> = engine
      .execute_as(key, "login", (params_object,), "`Result`")
      .await?;
    parse_output(output)
  }

  pub async fn bind(
    &self, engine: &Engine, key: impl AsRef<str>, params: &HashMap<String, String>,
    user: &HashMap<String, String>,
  ) -> Result<HashMap<String, String>, OAuthError> {
    let key = key.as_ref();
    let key = format!("oauth-{}", key);
    let params_object = RuneMap(params.clone());
    let user_object = RuneMap(user.clone());
    let output: Result<Value, Value> = engine
      .execute_as(key, "bind", (params_object, user_object), "`Result`")
      .await?;
    parse_output(output)
  }
}

pub async fn initialize(_config: &Option<Config>) -> OAuth {
  OAuth
}

#[cfg(test)]
mod tests {
  use std::collections::HashMap;

  use r2s_engine::Engine;

  use super::{OAuth, RuneMap};

  const LOGIN_SCRIPT: &str = r#"pub fn login(params) { Ok(#{ auth_key: params.get("code").unwrap(), provider: "example" }) } pub fn bind(params, user) { Ok(#{ auth_key: user.get("id").unwrap(), bound: params.get("state").unwrap() }) }"#;

  fn params(entries: &[(&str, &str)]) -> HashMap<String, String> {
    entries
      .iter()
      .map(|(k, v)| (k.to_string(), v.to_string()))
      .collect()
  }

  #[test]
  fn rune_map_get_returns_cloned_values() {
    let map = RuneMap(params(&[("code", "xyz"), ("state", "ok")]));
    assert_eq!(map.0.get("code").map(String::as_str), Some("xyz"));
    assert!(!map.0.contains_key("missing"));
  }

  #[tokio::test]
  async fn lint_accepts_scripts_with_login_and_bind() {
    let markers = OAuth.lint(LOGIN_SCRIPT).await.unwrap();
    assert!(markers.is_empty(), "unexpected markers: {markers:?}");
  }

  #[tokio::test]
  async fn lint_reports_missing_entry_points() {
    let markers = OAuth.lint("pub fn other() { 1 }").await.unwrap();
    for required in ["login", "bind"] {
      assert!(
        markers
          .iter()
          .any(|m| m.message == format!("missing required function: {required}")),
        "missing marker for `{required}`: {markers:?}"
      );
    }
  }

  #[tokio::test]
  async fn login_maps_script_output_into_plain_strings() {
    let engine = Engine::default();
    OAuth
      .preload(&engine, "example", LOGIN_SCRIPT)
      .await
      .unwrap();

    let data = OAuth
      .login(&engine, "example", &params(&[("code", "auth-code-1")]))
      .await
      .unwrap();

    assert_eq!(
      data.get("auth_key").map(String::as_str),
      Some("auth-code-1")
    );
    assert_eq!(data.get("provider").map(String::as_str), Some("example"));
  }

  #[tokio::test]
  async fn bind_receives_params_and_user_maps() {
    let engine = Engine::default();
    OAuth
      .preload(&engine, "example", LOGIN_SCRIPT)
      .await
      .unwrap();

    let data = OAuth
      .bind(
        &engine,
        "example",
        &params(&[("state", "pending")]),
        &params(&[("id", "user-42")]),
      )
      .await
      .unwrap();

    assert_eq!(data.get("auth_key").map(String::as_str), Some("user-42"));
    assert_eq!(data.get("bound").map(String::as_str), Some("pending"));
  }

  #[tokio::test]
  async fn login_propagates_script_errors() {
    let engine = Engine::default();
    OAuth
      .preload(
        &engine,
        "boom",
        r#"pub fn login(params) { Err("upstream down") }"#,
      )
      .await
      .unwrap();

    let err = OAuth
      .login(&engine, "boom", &HashMap::new())
      .await
      .unwrap_err();
    assert!(err.to_string().contains("upstream down"), "error: {err:?}");
  }

  #[tokio::test]
  async fn login_requires_auth_key_in_script_result() {
    let engine = Engine::default();
    OAuth
      .preload(
        &engine,
        "no-key",
        r#"pub fn login(params) { Ok(#{ provider: "example" }) }"#,
      )
      .await
      .unwrap();

    let err = OAuth
      .login(&engine, "no-key", &HashMap::new())
      .await
      .unwrap_err();
    assert!(
      matches!(&err, super::OAuthError::MissingField(field) if field == "auth_key"),
      "error: {err:?}"
    );
  }
}

use k8s_openapi::api::core::v1::{Pod, Service};
use kube::ResourceExt;
use r2s_engine::{DiagnosticMarker, Engine, EngineError, GLOBAL_ENGINE};
use rune::{Any, ContextError, Module, Value, alloc::clone::TryClone, runtime::Object};
use serde::{Deserialize, Serialize};

use crate::ClusterError;

#[derive(Clone, Debug, Default)]
pub struct TrafficMapper;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MappedPort {
  pub name: String,
  pub address: String,
}

#[derive(TryClone, Debug, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RunePortInfo {
  #[rune(get)]
  pub name: String,
  #[rune(get)]
  pub node_port: u16,
  #[rune(get)]
  pub app_protocol: String,
}

#[derive(Debug, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServiceInfo {
  #[rune(get)]
  pub traffic: String,
  #[rune(get)]
  pub created_at: i64,
  #[rune(get)]
  pub lifetime: u64,
  #[rune(get)]
  pub ports: rune::alloc::Vec<RunePortInfo>,
}

impl RuneServiceInfo {
  pub fn try_from_service(service: &Service, pod: &Pod) -> Result<Self, ClusterError> {
    let renew = pod
      .metadata
      .annotations
      .clone()
      .unwrap_or_default()
      .get("ret.sh.cn/renew")
      .map(|v| v.parse::<i32>().unwrap_or(0))
      .unwrap_or(0);
    let lifetime: u64 = ((renew + 1) * 3600) as u64;
    let created_at = pod
      .metadata
      .creation_timestamp
      .clone()
      .unwrap()
      .0
      .as_second();
    let mut ports_info = Vec::new();
    for port in service.spec.as_ref().unwrap().ports.as_ref().unwrap() {
      let port_info = RunePortInfo {
        name: port.name.clone().unwrap_or("default".to_owned()),
        node_port: port.node_port.unwrap_or(0) as u16,
        app_protocol: port.app_protocol.clone().unwrap_or("tcp".to_owned()).replace("ret.sh.cn/traffic/", ""),
      };
      ports_info.push(port_info);
    }

    Ok(Self {
      traffic: service
        .labels()
        .get("ret.sh.cn/traffic")
        .ok_or(ClusterError::MissingField("traffic".to_string()))?
        .to_owned(),
      created_at,
      lifetime,
      ports: ports_info.try_into().map_err(EngineError::from)?,
    })
  }
}

#[rune::module(::ret2shell::cluster)]
fn module(_stdio: bool) -> Result<Module, ContextError> {
  let mut module = Module::from_meta(self::module_meta)?;
  module.ty::<RunePortInfo>()?;
  module.ty::<RuneServiceInfo>()?;
  Ok(module)
}

impl TrafficMapper {
  fn default_modules() -> Vec<fn(bool) -> Result<rune::Module, rune::ContextError>> {
    vec![
      rune_modules::http::module,
      rune_modules::json::module,
      rune_modules::toml::module,
      rune_modules::rand::module,
      rune_modules::process::module,
      module,
    ]
  }

  pub async fn expire(&self, key: impl AsRef<str>) {
    GLOBAL_ENGINE
      .expire(format!("traffic-{}", key.as_ref()))
      .await
  }

  /// linter for rune scripts
  /// Originally from https://github.com/ElaBosak233/cdsctf/blob/main/crates/checker/src/traits.rs
  pub async fn lint(&self, script: impl AsRef<str>) -> Result<Vec<DiagnosticMarker>, EngineError> {
    Engine::lint(Self::default_modules(), script, &["expose"]).await
  }

  pub async fn preload(
    &self, key: impl AsRef<str>, script: impl AsRef<str>,
  ) -> Result<(), EngineError> {
    let key = key.as_ref();
    let key = format!("traffic-{}", key);
    GLOBAL_ENGINE
      .preload(Self::default_modules(), key, script, None)
      .await
  }

  pub async fn expose(
    &self, key: impl AsRef<str>, pod: Pod, service: Service,
  ) -> Result<Vec<MappedPort>, ClusterError> {
    let key = format!("traffic-{}", key.as_ref());

    let service_info = RuneServiceInfo::try_from_service(&service, &pod)?;
    let node_name = pod
      .spec
      .ok_or(ClusterError::MissingField("pod::spec".to_owned()))?
      .node_name
      .ok_or(ClusterError::MissingField("pod::node_name".to_owned()))?;

    let output = GLOBAL_ENGINE
      .execute(key, "expose", (node_name, service_info))
      .await?;

    let output: Result<Object, Value> = rune::from_value(output).map_err(EngineError::from)?;
    let mut result = Vec::new();
    if let Ok(object) = output {
      for (key, value) in object.iter() {
        result.push(MappedPort {
          name: key.to_string(),
          address: rune::from_value(value.clone()).map_err(EngineError::from)?,
        });
      }
      Ok(result)
    } else {
      Err(EngineError::ScriptError("early returns from script".to_owned()).into())
    }
  }
}

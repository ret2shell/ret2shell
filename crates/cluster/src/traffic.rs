use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use k8s_openapi::api::core::v1::{Pod, Service};
use kube::ResourceExt;
use rune::{
  runtime::{Object, RuntimeContext},
  termcolor::Buffer,
  Any, Context, ContextError, Diagnostics, Module, Source, Sources, Unit, Value, Vm,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::debug;

use crate::ClusterError;

type TrafficMapperContext = (Arc<Unit>, Arc<RuntimeContext>, DateTime<Utc>);

#[derive(Clone, Debug, Default)]
pub struct TrafficMapper {
  contexts: Arc<RwLock<HashMap<String, TrafficMapperContext>>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MappedPort {
  pub name: String,
  pub address: String,
}

#[derive(Clone, Debug, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RunePortInfo {
  #[rune(get)]
  pub name: String,
  #[rune(get)]
  pub node_port: u16,
}

#[derive(Clone, Debug, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServiceInfo {
  #[rune(get)]
  pub traffic: String,
  #[rune(get)]
  pub created_at: i64,
  #[rune(get)]
  pub lifetime: u64,
  #[rune(get)]
  pub ports: Vec<RunePortInfo>,
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
      .timestamp();
    let mut ports_info = Vec::new();
    for port in service.spec.as_ref().unwrap().ports.as_ref().unwrap() {
      let port_info = RunePortInfo {
        name: port.name.clone().unwrap_or("default".to_owned()),
        node_port: port.node_port.unwrap_or(0) as u16,
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
      ports: ports_info,
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
  async fn build_context() -> Result<Context, ClusterError> {
    let mut context = Context::with_default_modules()?;
    context.install(rune_modules::http::module(true)?)?;
    context.install(rune_modules::json::module(true)?)?;
    context.install(rune_modules::toml::module(true)?)?;
    context.install(rune_modules::process::module(true)?)?;
    context.install(module(true)?)?;
    Ok(context)
  }

  pub async fn expire(&self, key: &str) {
    self.contexts.write().await.remove(key);
  }

  pub async fn preload(&self, key: &str, script: &str) -> Result<(), ClusterError> {
    let mut contexts = self.contexts.write().await;
    if contexts.contains_key(key) {
      return Ok(());
    }
    let context = Self::build_context().await?;
    let mut sources = Sources::new();
    sources.insert(Source::memory(script)?)?;

    let unit = rune::prepare(&mut sources).with_context(&context).build()?;
    let runtime = context.runtime()?;

    contexts.insert(
      key.to_string(),
      (Arc::new(unit), Arc::new(runtime), Utc::now()),
    );
    Ok(())
  }

  pub async fn lint(&self, script: &str) -> Result<(), ClusterError> {
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
      return Err(ClusterError::CompileError(
        (String::from_utf8(out.into_inner())?).to_string(),
      ));
    }
    let unit = rune::prepare(&mut sources).with_context(&context).build()?;
    let runtime = context.runtime()?;
    let vm = Vm::new(Arc::new(runtime), Arc::new(unit));
    vm.lookup_function(["expose"])
      .map_err(|_| ClusterError::MissingFunction("expose".to_owned()))?;

    Ok(())
  }

  pub async fn expose(
    &self, key: &str, pod: Pod, service: Service,
  ) -> Result<Vec<MappedPort>, ClusterError> {
    let contexts = self.contexts.read().await;
    debug!("Exposing traffic mapper for pod: {pod:?}, service: {service:?}");
    let (unit, runtime, _) = contexts.get(key).ok_or_else(|| {
      ClusterError::MissingField(format!("traffic mapper not found for key: {}", key))
    })?;
    let vm = Vm::new(runtime.clone(), unit.clone());
    let service_info = RuneServiceInfo::try_from_service(&service, &pod)?;
    let pod_name = pod
      .spec
      .ok_or(ClusterError::MissingField("pod spec".to_owned()))?
      .node_name
      .ok_or(ClusterError::MissingField("node_name".to_owned()))?;

    let output = vm.send_execute(["expose"], (pod_name, service_info))?;
    let output = output.async_complete().await.into_result()?;

    let output: Result<Object, Value> = rune::from_value(output)?;
    let mut result = Vec::new();
    if let Ok(object) = output {
      for (key, value) in object.iter() {
        result.push(MappedPort {
          name: key.to_string(),
          address: rune::from_value(value.clone())?,
        });
      }
      Ok(result)
    } else {
      Err(ClusterError::ScriptError(
        "Early returns from script".to_owned(),
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
      tracing::debug!("Running traffic mapper cleanup...");
      self.cleanup().await;
      tracing::trace!("Live mappers: {:?}", self.contexts.read().await.keys());
    }
  }
}

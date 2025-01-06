use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use k8s_openapi::api::core::v1::{Pod, Service};
use kube::ResourceExt;
use rune::{
  alloc,
  runtime::{Object, RuntimeContext},
  termcolor::Buffer,
  Context, Diagnostics, Source, Sources, Unit, Value, Vm,
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

impl TrafficMapper {
  async fn build_context() -> Result<Context, ClusterError> {
    let mut context = Context::with_default_modules()?;
    context.install(rune_modules::http::module(true)?)?;
    context.install(rune_modules::json::module(true)?)?;
    context.install(rune_modules::toml::module(true)?)?;
    context.install(rune_modules::process::module(true)?)?;
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
    let mut vm = Vm::new(runtime.clone(), unit.clone());
    let mut service_info = Object::new();
    service_info.insert(
      alloc::String::try_from("traffic")?,
      rune::to_value(
        service
          .labels()
          .get("ret.sh.cn/traffic")
          .ok_or(ClusterError::MissingField("traffic".to_string()))?
          .to_owned(),
      )?,
    )?;
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
      .ok_or(ClusterError::MissingField("creation_timestamp".to_string()))?
      .0
      .timestamp();
    service_info.insert(
      alloc::String::try_from("created_at")?,
      rune::to_value(created_at)?,
    )?;
    service_info.insert(
      alloc::String::try_from("lifetime")?,
      rune::to_value(lifetime)?,
    )?;

    let mut ports_info = Vec::new();

    for port in service
      .spec
      .ok_or(ClusterError::MissingField("service spec".to_owned()))?
      .ports
      .ok_or(ClusterError::MissingField("service ports".to_owned()))?
    {
      let mut port_object = Object::new();
      port_object.insert(
        alloc::String::try_from("name")?,
        rune::to_value(port.name.unwrap_or("default".to_owned()))?,
      )?;
      port_object.insert(
        alloc::String::try_from("node_port")?,
        rune::to_value(port.node_port.unwrap_or(0))?,
      )?;
      ports_info.push(port_object);
    }

    service_info.insert(
      alloc::String::try_from("ports")?,
      rune::to_value(ports_info)?,
    )?;
    let pod_name = pod
      .spec
      .ok_or(ClusterError::MissingField("pod spec".to_owned()))?
      .node_name
      .ok_or(ClusterError::MissingField("node_name".to_owned()))?;

    let output = vm.call(["expose"], (rune::to_value(pod_name)?, service_info))?;

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

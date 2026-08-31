use k8s_openapi::api::core::v1::{Pod, Service};
use kube::ResourceExt;
use r2s_engine::{DiagnosticMarker, Engine, EngineError, parse_value, script_error_from_value};
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
  pub protocol: String,
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
      .unwrap_or(0)
      .max(0);
    let lifetime: u64 = ((renew + 1) * 3600) as u64;
    let created_at = pod
      .metadata
      .creation_timestamp
      .clone()
      .ok_or(ClusterError::MissingField(
        "pod::creation_timestamp".to_owned(),
      ))?
      .0
      .as_second();
    let mut ports_info = Vec::new();
    for port in service.spec.as_ref().unwrap().ports.as_ref().unwrap() {
      let port_info = RunePortInfo {
        name: port.name.clone().unwrap_or("default".to_owned()),
        node_port: port.node_port.unwrap_or(0) as u16,
        protocol: port.protocol.clone().unwrap_or("TCP".to_owned()),
        app_protocol: port
          .app_protocol
          .clone()
          .unwrap_or("tcp".to_owned())
          .replace("ret.sh.cn/traffic-", ""),
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

  pub async fn expire(&self, engine: &Engine, key: impl AsRef<str>) {
    engine.expire(format!("traffic-{}", key.as_ref())).await
  }

  /// linter for rune scripts
  /// Originally from https://github.com/ElaBosak233/cdsctf/blob/main/crates/checker/src/traits.rs
  pub async fn lint(&self, script: impl AsRef<str>) -> Result<Vec<DiagnosticMarker>, EngineError> {
    Engine::lint(Self::default_modules(), script, &["expose"]).await
  }

  pub async fn preload(
    &self, engine: &Engine, key: impl AsRef<str>, script: impl AsRef<str>,
  ) -> Result<(), EngineError> {
    let key = key.as_ref();
    let key = format!("traffic-{}", key);
    engine
      .preload(Self::default_modules(), key, script, None)
      .await
  }

  pub async fn expose(
    &self, engine: &Engine, key: impl AsRef<str>, pod: Pod, service: Service,
  ) -> Result<Vec<MappedPort>, ClusterError> {
    let key = format!("traffic-{}", key.as_ref());

    let service_info = RuneServiceInfo::try_from_service(&service, &pod)?;
    let node_name = pod
      .spec
      .ok_or(ClusterError::MissingField("pod::spec".to_owned()))?
      .node_name
      .ok_or(ClusterError::MissingField("pod::node_name".to_owned()))?;

    let output: Result<Value, Value> = engine
      .execute_as(key, "expose", (node_name, service_info), "`Result`")
      .await?;
    let mut result = Vec::new();
    match output {
      Ok(value) => {
        let object: Object = parse_value(value, "`Object` inside `Ok`")?;
        for (key, value) in object.iter() {
          result.push(MappedPort {
            name: key.to_string(),
            address: parse_value(value.clone(), "a `String` address")?,
          });
        }
        Ok(result)
      }
      Err(error) => Err(script_error_from_value(error)),
    }
  }
}

#[cfg(test)]
mod tests {
  use std::collections::BTreeMap;

  use k8s_openapi::{
    api::core::v1::{Pod, PodSpec, Service, ServicePort, ServiceSpec},
    apimachinery::pkg::apis::meta::v1::{ObjectMeta, Time},
  };

  use super::{ClusterError, RuneServiceInfo};

  fn creation_time(seconds: i64) -> Time {
    // `Time` wraps a jiff timestamp; build it through its serde representation
    // to avoid depending on jiff directly.
    serde_json::from_value(serde_json::json!(format!(
      "2023-11-14T22:{:02}:{:02}Z",
      seconds / 60 % 60,
      seconds % 60
    )))
    .unwrap()
  }

  fn pod(renew: Option<&str>) -> Pod {
    pod_with_timestamp(renew, Some(creation_time(1_700_000_000)))
  }

  fn pod_with_timestamp(renew: Option<&str>, created_at: Option<Time>) -> Pod {
    let mut annotations = BTreeMap::new();
    if let Some(renew) = renew {
      annotations.insert("ret.sh.cn/renew".to_owned(), renew.to_owned());
    }
    Pod {
      metadata: ObjectMeta {
        name: Some("challenge-web-0".to_owned()),
        namespace: Some("ret2shell".to_owned()),
        annotations: Some(annotations),
        creation_timestamp: created_at,
        ..Default::default()
      },
      spec: Some(PodSpec {
        node_name: Some("node-a".to_owned()),
        ..Default::default()
      }),
      ..Default::default()
    }
  }

  fn service(app_protocol: Option<&str>, with_label: bool) -> Service {
    let mut labels = BTreeMap::new();
    if with_label {
      labels.insert("ret.sh.cn/traffic".to_owned(), "web".to_owned());
    }
    Service {
      metadata: ObjectMeta {
        labels: Some(labels),
        ..Default::default()
      },
      spec: Some(ServiceSpec {
        ports: Some(vec![ServicePort {
          name: None,
          node_port: Some(30123),
          protocol: None,
          app_protocol: app_protocol.map(str::to_owned),
          ..Default::default()
        }]),
        ..Default::default()
      }),
      ..Default::default()
    }
  }

  #[test]
  fn service_info_maps_ports_and_strips_traffic_app_protocol_prefix() {
    let info = RuneServiceInfo::try_from_service(
      &service(Some("ret.sh.cn/traffic-http"), true),
      &pod(Some("2")),
    )
    .unwrap();

    assert_eq!(info.traffic, "web");
    assert_eq!(info.created_at, 1_700_000_000);
    assert_eq!(info.lifetime, (2 + 1) * 3600);
    assert_eq!(info.ports.len(), 1);
    let port = &info.ports[0];
    assert_eq!(port.name, "default");
    assert_eq!(port.node_port, 30123);
    assert_eq!(port.protocol, "TCP");
    assert_eq!(port.app_protocol, "http");
  }

  #[test]
  fn service_info_defaults_renew_to_one_hour_without_annotation() {
    let info = RuneServiceInfo::try_from_service(&service(None, true), &pod(None)).unwrap();
    assert_eq!(info.lifetime, 3600);
    assert_eq!(info.ports[0].app_protocol, "tcp");
  }

  #[test]
  fn service_info_treats_invalid_renew_annotation_as_zero() {
    let info =
      RuneServiceInfo::try_from_service(&service(None, true), &pod(Some("not-a-number"))).unwrap();
    assert_eq!(info.lifetime, 3600);
  }

  #[test]
  fn service_info_requires_traffic_label_on_service() {
    let err = RuneServiceInfo::try_from_service(&service(None, false), &pod(None)).unwrap_err();
    assert!(matches!(err, ClusterError::MissingField(field) if field == "traffic"));
  }

  #[test]
  fn service_info_clamps_negative_renew_annotation_to_one_hour() {
    let info = RuneServiceInfo::try_from_service(&service(None, true), &pod(Some("-5"))).unwrap();
    assert_eq!(info.lifetime, 3600);
  }

  #[test]
  fn service_info_reports_missing_creation_timestamp_instead_of_panicking() {
    let err =
      RuneServiceInfo::try_from_service(&service(None, true), &pod_with_timestamp(None, None))
        .unwrap_err();
    assert!(matches!(err, ClusterError::MissingField(field) if field == "pod::creation_timestamp"));
  }
}

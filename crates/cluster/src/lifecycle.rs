use std::collections::BTreeMap;

use k8s_openapi::api::core::v1::{Container, Pod, Service, ServicePort};
use r2s_engine::{DiagnosticMarker, Engine, EngineError};
use rune::{
  Any, ContextError, Module, Value,
  alloc::{Error as RuneAllocError, Vec as RuneVec, clone::TryClone},
};
use serde::{Deserialize, Serialize};

use crate::{ChallengeEnvSnapshot, ClusterError};

#[derive(Clone, Debug, Default)]
pub struct LifecycleMapper;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleStopReason {
  Manual,
  Timeout,
}

impl LifecycleStopReason {
  pub const fn as_str(&self) -> &'static str {
    match self {
      Self::Manual => "manual",
      Self::Timeout => "timeout",
    }
  }
}

#[derive(Clone, Copy, Debug)]
pub enum LifecycleEvent {
  Start,
  Delay,
  Stop(LifecycleStopReason),
}

impl LifecycleEvent {
  pub const fn function_name(&self) -> &'static str {
    match self {
      Self::Start => "on_start",
      Self::Delay => "on_delay",
      Self::Stop(_) => "on_stop",
    }
  }

  pub const fn name(&self) -> &'static str {
    match self {
      Self::Start => "start",
      Self::Delay => "delay",
      Self::Stop(_) => "stop",
    }
  }

  pub const fn reason(&self) -> Option<LifecycleStopReason> {
    match self {
      Self::Stop(reason) => Some(*reason),
      _ => None,
    }
  }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LifecycleExecutionStatus {
  Executed,
  Skipped,
}

#[derive(Clone, Debug, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneStringMap(pub BTreeMap<String, String>);

impl TryClone for RuneStringMap {
  fn try_clone(&self) -> Result<Self, RuneAllocError> {
    Ok(self.clone())
  }
}

impl RuneStringMap {
  #[rune::function(path = Self::get)]
  pub fn get(&self, key: &str) -> Option<String> {
    self.0.get(key).cloned()
  }

  #[rune::function(path = Self::contains_key)]
  pub fn contains_key(&self, key: &str) -> bool {
    self.0.contains_key(key)
  }

  #[rune::function(path = Self::len)]
  pub fn len(&self) -> usize {
    self.0.len()
  }

  #[rune::function(path = Self::is_empty)]
  pub fn is_empty(&self) -> bool {
    self.0.is_empty()
  }
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneMetadata {
  #[rune(get)]
  pub name: Option<String>,
  #[rune(get)]
  pub namespace: Option<String>,
  #[rune(get)]
  pub uid: Option<String>,
  #[rune(get)]
  pub resource_version: Option<String>,
  #[rune(get)]
  pub generation: Option<i64>,
  #[rune(get)]
  pub creation_timestamp: Option<i64>,
  #[rune(get)]
  pub deletion_timestamp: Option<i64>,
  #[rune(get)]
  pub labels: RuneStringMap,
  #[rune(get)]
  pub annotations: RuneStringMap,
}

#[derive(Clone, Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneContainerPort {
  #[rune(get)]
  pub name: Option<String>,
  #[rune(get)]
  pub container_port: i32,
  #[rune(get)]
  pub host_port: Option<i32>,
  #[rune(get)]
  pub protocol: Option<String>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneContainerInfo {
  #[rune(get)]
  pub name: String,
  #[rune(get)]
  pub image: Option<String>,
  #[rune(get)]
  pub ports: RuneVec<RuneContainerPort>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RunePodSpec {
  #[rune(get)]
  pub node_name: Option<String>,
  #[rune(get)]
  pub service_account_name: Option<String>,
  #[rune(get)]
  pub restart_policy: Option<String>,
  #[rune(get)]
  pub hostname: Option<String>,
  #[rune(get)]
  pub subdomain: Option<String>,
  #[rune(get)]
  pub scheduler_name: Option<String>,
  #[rune(get)]
  pub enable_service_links: Option<bool>,
  #[rune(get)]
  pub host_network: Option<bool>,
  #[rune(get)]
  pub containers: RuneVec<RuneContainerInfo>,
  #[rune(get)]
  pub init_containers: RuneVec<RuneContainerInfo>,
}

#[derive(Clone, Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RunePodCondition {
  #[rune(get)]
  pub type_: String,
  #[rune(get)]
  pub status: String,
  #[rune(get)]
  pub reason: Option<String>,
  #[rune(get)]
  pub message: Option<String>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RunePodStatus {
  #[rune(get)]
  pub phase: Option<String>,
  #[rune(get)]
  pub pod_ip: Option<String>,
  #[rune(get)]
  pub host_ip: Option<String>,
  #[rune(get)]
  pub qos_class: Option<String>,
  #[rune(get)]
  pub conditions: RuneVec<RunePodCondition>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RunePodInfo {
  #[rune(get)]
  pub name: Option<String>,
  #[rune(get)]
  pub namespace: Option<String>,
  #[rune(get)]
  pub labels: RuneStringMap,
  #[rune(get)]
  pub annotations: RuneStringMap,
  #[rune(get)]
  pub metadata: RuneMetadata,
  #[rune(get)]
  pub spec: RunePodSpec,
  #[rune(get)]
  pub status: RunePodStatus,
}

#[derive(Clone, Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServicePort {
  #[rune(get)]
  pub name: Option<String>,
  #[rune(get)]
  pub protocol: Option<String>,
  #[rune(get)]
  pub app_protocol: Option<String>,
  #[rune(get)]
  pub port: i32,
  #[rune(get)]
  pub target_port: Option<String>,
  #[rune(get)]
  pub node_port: Option<i32>,
}

#[derive(Clone, Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneLoadBalancerIngress {
  #[rune(get)]
  pub ip: Option<String>,
  #[rune(get)]
  pub hostname: Option<String>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServiceSpec {
  #[rune(get)]
  pub type_: Option<String>,
  #[rune(get)]
  pub cluster_ip: Option<String>,
  #[rune(get)]
  pub cluster_ips: RuneVec<String>,
  #[rune(get)]
  pub external_ips: RuneVec<String>,
  #[rune(get)]
  pub external_name: Option<String>,
  #[rune(get)]
  pub load_balancer_class: Option<String>,
  #[rune(get)]
  pub session_affinity: Option<String>,
  #[rune(get)]
  pub internal_traffic_policy: Option<String>,
  #[rune(get)]
  pub external_traffic_policy: Option<String>,
  #[rune(get)]
  pub ip_families: RuneVec<String>,
  #[rune(get)]
  pub ip_family_policy: Option<String>,
  #[rune(get)]
  pub selector: RuneStringMap,
  #[rune(get)]
  pub ports: RuneVec<RuneServicePort>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServiceStatus {
  #[rune(get)]
  pub load_balancer_ingress: RuneVec<RuneLoadBalancerIngress>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServiceInternalInfo {
  #[rune(get)]
  pub cluster_ip: Option<String>,
  #[rune(get)]
  pub cluster_ips: RuneVec<String>,
  #[rune(get)]
  pub dns_names: RuneVec<String>,
  #[rune(get)]
  pub ports: RuneVec<RuneServicePort>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServiceExternalInfo {
  #[rune(get)]
  pub external_name: Option<String>,
  #[rune(get)]
  pub external_ips: RuneVec<String>,
  #[rune(get)]
  pub load_balancer_ingress: RuneVec<RuneLoadBalancerIngress>,
  #[rune(get)]
  pub node_ports: RuneVec<RuneServicePort>,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct RuneServiceInfo {
  #[rune(get)]
  pub name: Option<String>,
  #[rune(get)]
  pub namespace: Option<String>,
  #[rune(get)]
  pub labels: RuneStringMap,
  #[rune(get)]
  pub annotations: RuneStringMap,
  #[rune(get)]
  pub metadata: RuneMetadata,
  #[rune(get)]
  pub spec: RuneServiceSpec,
  #[rune(get)]
  pub status: RuneServiceStatus,
  #[rune(get)]
  pub internal: RuneServiceInternalInfo,
  #[rune(get)]
  pub external: RuneServiceExternalInfo,
}

#[derive(Clone, Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct LifecycleUserInfo {
  #[rune(get)]
  pub id: i64,
  #[rune(get)]
  pub account: String,
  #[rune(get)]
  pub nickname: String,
  #[rune(get)]
  pub institute_id: Option<i64>,
}

#[derive(Clone, Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct LifecycleTeamInfo {
  #[rune(get)]
  pub id: Option<i64>,
  #[rune(get)]
  pub name: Option<String>,
  #[rune(get)]
  pub institute_id: Option<i64>,
  #[rune(get)]
  pub token: Option<String>,
}

#[derive(Clone, Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct LifecycleChallengeInfo {
  #[rune(get)]
  pub id: i64,
  #[rune(get)]
  pub name: String,
  #[rune(get)]
  pub game_id: i64,
}

pub struct LifecycleExecutionRequest<'a> {
  pub event: LifecycleEvent,
  pub snapshot: &'a ChallengeEnvSnapshot,
  pub user: LifecycleUserInfo,
  pub team: Option<LifecycleTeamInfo>,
  pub challenge: LifecycleChallengeInfo,
}

#[derive(Debug, TryClone, Any)]
#[rune(item = ::ret2shell::cluster)]
pub struct LifecycleContext {
  #[rune(get)]
  pub pod: RunePodInfo,
  #[rune(get)]
  pub service: RuneServiceInfo,
  #[rune(get)]
  pub user: LifecycleUserInfo,
  #[rune(get)]
  pub team: Option<LifecycleTeamInfo>,
  #[rune(get)]
  pub challenge: LifecycleChallengeInfo,
  #[rune(get)]
  pub reason: Option<String>,
}

#[rune::module(::ret2shell::cluster)]
fn module(_stdio: bool) -> Result<Module, ContextError> {
  let mut module = Module::from_meta(self::module_meta)?;
  module.ty::<RuneStringMap>()?;
  module.function_meta(RuneStringMap::get)?;
  module.function_meta(RuneStringMap::contains_key)?;
  module.function_meta(RuneStringMap::len)?;
  module.function_meta(RuneStringMap::is_empty)?;
  module.ty::<RuneMetadata>()?;
  module.ty::<RuneContainerPort>()?;
  module.ty::<RuneContainerInfo>()?;
  module.ty::<RunePodSpec>()?;
  module.ty::<RunePodCondition>()?;
  module.ty::<RunePodStatus>()?;
  module.ty::<RunePodInfo>()?;
  module.ty::<RuneServicePort>()?;
  module.ty::<RuneLoadBalancerIngress>()?;
  module.ty::<RuneServiceSpec>()?;
  module.ty::<RuneServiceStatus>()?;
  module.ty::<RuneServiceInternalInfo>()?;
  module.ty::<RuneServiceExternalInfo>()?;
  module.ty::<RuneServiceInfo>()?;
  module.ty::<LifecycleUserInfo>()?;
  module.ty::<LifecycleTeamInfo>()?;
  module.ty::<LifecycleChallengeInfo>()?;
  module.ty::<LifecycleContext>()?;
  Ok(module)
}

fn is_preserved_metadata_key(key: &str) -> bool {
  let Some((domain, _)) = key.split_once('/') else {
    return false;
  };
  domain == "ret.sh.cn"
    || domain == "kubernetes.io"
    || domain.ends_with(".kubernetes.io")
    || domain == "k8s.io"
    || domain.ends_with(".k8s.io")
}

fn to_rune_vec<T>(items: Vec<T>) -> Result<RuneVec<T>, ClusterError>
where
  T: TryClone, {
  items
    .try_into()
    .map_err(EngineError::from)
    .map_err(Into::into)
}

fn to_rune_map(
  map: Option<&BTreeMap<String, String>>, filter_metadata: bool,
) -> Result<RuneStringMap, ClusterError> {
  let mut entries = BTreeMap::new();
  for (key, value) in map.cloned().unwrap_or_default() {
    if filter_metadata && !is_preserved_metadata_key(&key) {
      continue;
    }
    entries.insert(key, value);
  }
  Ok(RuneStringMap(entries))
}

fn timestamp_to_seconds(
  timestamp: Option<k8s_openapi::apimachinery::pkg::apis::meta::v1::Time>,
) -> Option<i64> {
  timestamp.map(|time| time.0.as_second())
}

fn target_port_to_string(
  target_port: Option<&k8s_openapi::apimachinery::pkg::util::intstr::IntOrString>,
) -> Option<String> {
  match target_port {
    Some(k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(value)) => {
      Some(value.to_string())
    }
    Some(k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::String(value)) => {
      Some(value.clone())
    }
    None => None,
  }
}

fn dns_names(name: Option<&String>, namespace: Option<&String>) -> Vec<String> {
  let Some(name) = name else {
    return Vec::new();
  };
  let Some(namespace) = namespace else {
    return vec![name.clone()];
  };
  vec![
    name.clone(),
    format!("{name}.{namespace}"),
    format!("{name}.{namespace}.svc"),
    format!("{name}.{namespace}.svc.cluster.local"),
  ]
}

impl RuneMetadata {
  fn from_pod(pod: &Pod) -> Result<Self, ClusterError> {
    Ok(Self {
      name: pod.metadata.name.clone(),
      namespace: pod.metadata.namespace.clone(),
      uid: pod.metadata.uid.clone(),
      resource_version: pod.metadata.resource_version.clone(),
      generation: pod.metadata.generation,
      creation_timestamp: timestamp_to_seconds(pod.metadata.creation_timestamp.clone()),
      deletion_timestamp: timestamp_to_seconds(pod.metadata.deletion_timestamp.clone()),
      labels: to_rune_map(pod.metadata.labels.as_ref(), true)?,
      annotations: to_rune_map(pod.metadata.annotations.as_ref(), true)?,
    })
  }

  fn from_service(service: &Service) -> Result<Self, ClusterError> {
    Ok(Self {
      name: service.metadata.name.clone(),
      namespace: service.metadata.namespace.clone(),
      uid: service.metadata.uid.clone(),
      resource_version: service.metadata.resource_version.clone(),
      generation: service.metadata.generation,
      creation_timestamp: timestamp_to_seconds(service.metadata.creation_timestamp.clone()),
      deletion_timestamp: timestamp_to_seconds(service.metadata.deletion_timestamp.clone()),
      labels: to_rune_map(service.metadata.labels.as_ref(), true)?,
      annotations: to_rune_map(service.metadata.annotations.as_ref(), true)?,
    })
  }

  fn from_missing_service(snapshot: &ChallengeEnvSnapshot) -> Result<Self, ClusterError> {
    Ok(Self {
      name: snapshot.pod.metadata.name.clone(),
      namespace: snapshot.pod.metadata.namespace.clone(),
      uid: None,
      resource_version: None,
      generation: None,
      creation_timestamp: None,
      deletion_timestamp: None,
      labels: to_rune_map(snapshot.pod.metadata.labels.as_ref(), true)?,
      annotations: to_rune_map(None, true)?,
    })
  }
}

impl RuneContainerPort {
  fn from_container_port(port: &k8s_openapi::api::core::v1::ContainerPort) -> Self {
    Self {
      name: port.name.clone(),
      container_port: port.container_port,
      host_port: port.host_port,
      protocol: port.protocol.clone(),
    }
  }
}

impl RuneContainerInfo {
  fn from_container(container: &Container) -> Result<Self, ClusterError> {
    let ports = container
      .ports
      .clone()
      .unwrap_or_default()
      .iter()
      .map(RuneContainerPort::from_container_port)
      .collect::<Vec<_>>();
    Ok(Self {
      name: container.name.clone(),
      image: container.image.clone(),
      ports: to_rune_vec(ports)?,
    })
  }
}

impl RunePodSpec {
  fn from_pod(pod: &Pod) -> Result<Self, ClusterError> {
    let spec = pod.spec.as_ref();
    let containers = spec
      .map(|spec| {
        spec
          .containers
          .iter()
          .map(RuneContainerInfo::from_container)
          .collect::<Result<Vec<_>, _>>()
      })
      .transpose()?
      .unwrap_or_default();
    let init_containers = spec
      .and_then(|spec| spec.init_containers.as_ref())
      .map(|containers| {
        containers
          .iter()
          .map(RuneContainerInfo::from_container)
          .collect::<Result<Vec<_>, _>>()
      })
      .transpose()?
      .unwrap_or_default();
    Ok(Self {
      node_name: spec.and_then(|spec| spec.node_name.clone()),
      service_account_name: spec.and_then(|spec| spec.service_account_name.clone()),
      restart_policy: spec.and_then(|spec| spec.restart_policy.clone()),
      hostname: spec.and_then(|spec| spec.hostname.clone()),
      subdomain: spec.and_then(|spec| spec.subdomain.clone()),
      scheduler_name: spec.and_then(|spec| spec.scheduler_name.clone()),
      enable_service_links: spec.and_then(|spec| spec.enable_service_links),
      host_network: spec.and_then(|spec| spec.host_network),
      containers: to_rune_vec(containers)?,
      init_containers: to_rune_vec(init_containers)?,
    })
  }
}

impl RunePodCondition {
  fn from_condition(condition: &k8s_openapi::api::core::v1::PodCondition) -> Self {
    Self {
      type_: condition.type_.clone(),
      status: condition.status.clone(),
      reason: condition.reason.clone(),
      message: condition.message.clone(),
    }
  }
}

impl RunePodStatus {
  fn from_pod(pod: &Pod) -> Result<Self, ClusterError> {
    let status = pod.status.as_ref();
    let conditions = status
      .and_then(|status| status.conditions.as_ref())
      .map(|conditions| {
        conditions
          .iter()
          .map(RunePodCondition::from_condition)
          .collect::<Vec<_>>()
      })
      .unwrap_or_default();
    Ok(Self {
      phase: status.and_then(|status| status.phase.clone()),
      pod_ip: status.and_then(|status| status.pod_ip.clone()),
      host_ip: status.and_then(|status| status.host_ip.clone()),
      qos_class: status.and_then(|status| status.qos_class.clone()),
      conditions: to_rune_vec(conditions)?,
    })
  }
}

impl RunePodInfo {
  fn from_pod(pod: &Pod) -> Result<Self, ClusterError> {
    Ok(Self {
      name: pod.metadata.name.clone(),
      namespace: pod.metadata.namespace.clone(),
      labels: to_rune_map(pod.metadata.labels.as_ref(), true)?,
      annotations: to_rune_map(pod.metadata.annotations.as_ref(), true)?,
      metadata: RuneMetadata::from_pod(pod)?,
      spec: RunePodSpec::from_pod(pod)?,
      status: RunePodStatus::from_pod(pod)?,
    })
  }
}

impl RuneServicePort {
  fn from_service_port(port: &ServicePort) -> Self {
    Self {
      name: port.name.clone(),
      protocol: port.protocol.clone(),
      app_protocol: port.app_protocol.clone(),
      port: port.port,
      target_port: target_port_to_string(port.target_port.as_ref()),
      node_port: port.node_port,
    }
  }
}

impl RuneLoadBalancerIngress {
  fn from_ingress(ingress: &k8s_openapi::api::core::v1::LoadBalancerIngress) -> Self {
    Self {
      ip: ingress.ip.clone(),
      hostname: ingress.hostname.clone(),
    }
  }
}

fn service_ports(ports: Option<&Vec<ServicePort>>) -> Vec<RuneServicePort> {
  ports
    .cloned()
    .unwrap_or_default()
    .iter()
    .map(RuneServicePort::from_service_port)
    .collect()
}

fn service_ingresses(
  ingresses: Option<&Vec<k8s_openapi::api::core::v1::LoadBalancerIngress>>,
) -> Vec<RuneLoadBalancerIngress> {
  ingresses
    .cloned()
    .unwrap_or_default()
    .iter()
    .map(RuneLoadBalancerIngress::from_ingress)
    .collect()
}

impl RuneServiceInfo {
  fn from_snapshot(snapshot: &ChallengeEnvSnapshot) -> Result<Self, ClusterError> {
    if let Some(service) = &snapshot.service {
      let ports = service_ports(service.spec.as_ref().and_then(|spec| spec.ports.as_ref()));
      let node_ports = ports
        .iter()
        .filter(|port| port.node_port.is_some())
        .cloned()
        .collect::<Vec<_>>();
      let ingresses = service_ingresses(
        service
          .status
          .as_ref()
          .and_then(|status| status.load_balancer.as_ref())
          .and_then(|load_balancer| load_balancer.ingress.as_ref()),
      );
      let cluster_ips = service
        .spec
        .as_ref()
        .and_then(|spec| spec.cluster_ips.clone())
        .unwrap_or_default();
      let external_ips = service
        .spec
        .as_ref()
        .and_then(|spec| spec.external_ips.clone())
        .unwrap_or_default();
      let ip_families = service
        .spec
        .as_ref()
        .and_then(|spec| spec.ip_families.clone())
        .unwrap_or_default()
        .into_iter()
        .map(|family| family.to_string())
        .collect::<Vec<_>>();
      let dns_names = dns_names(
        service.metadata.name.as_ref(),
        service.metadata.namespace.as_ref(),
      );
      Ok(Self {
        name: service.metadata.name.clone(),
        namespace: service.metadata.namespace.clone(),
        labels: to_rune_map(service.metadata.labels.as_ref(), true)?,
        annotations: to_rune_map(service.metadata.annotations.as_ref(), true)?,
        metadata: RuneMetadata::from_service(service)?,
        spec: RuneServiceSpec {
          type_: service.spec.as_ref().and_then(|spec| spec.type_.clone()),
          cluster_ip: service
            .spec
            .as_ref()
            .and_then(|spec| spec.cluster_ip.clone()),
          cluster_ips: to_rune_vec(cluster_ips.clone())?,
          external_ips: to_rune_vec(external_ips.clone())?,
          external_name: service
            .spec
            .as_ref()
            .and_then(|spec| spec.external_name.clone()),
          load_balancer_class: service
            .spec
            .as_ref()
            .and_then(|spec| spec.load_balancer_class.clone()),
          session_affinity: service
            .spec
            .as_ref()
            .and_then(|spec| spec.session_affinity.clone()),
          internal_traffic_policy: service
            .spec
            .as_ref()
            .and_then(|spec| spec.internal_traffic_policy.clone()),
          external_traffic_policy: service
            .spec
            .as_ref()
            .and_then(|spec| spec.external_traffic_policy.clone()),
          ip_families: to_rune_vec(ip_families.clone())?,
          ip_family_policy: service
            .spec
            .as_ref()
            .and_then(|spec| spec.ip_family_policy.clone()),
          selector: to_rune_map(
            service
              .spec
              .as_ref()
              .and_then(|spec| spec.selector.as_ref()),
            false,
          )?,
          ports: to_rune_vec(ports.clone())?,
        },
        status: RuneServiceStatus {
          load_balancer_ingress: to_rune_vec(ingresses.clone())?,
        },
        internal: RuneServiceInternalInfo {
          cluster_ip: service
            .spec
            .as_ref()
            .and_then(|spec| spec.cluster_ip.clone()),
          cluster_ips: to_rune_vec(cluster_ips)?,
          dns_names: to_rune_vec(dns_names)?,
          ports: to_rune_vec(ports.clone())?,
        },
        external: RuneServiceExternalInfo {
          external_name: service
            .spec
            .as_ref()
            .and_then(|spec| spec.external_name.clone()),
          external_ips: to_rune_vec(external_ips)?,
          load_balancer_ingress: to_rune_vec(ingresses)?,
          node_ports: to_rune_vec(node_ports)?,
        },
      })
    } else {
      let dns_names = dns_names(
        snapshot.pod.metadata.name.as_ref(),
        snapshot.pod.metadata.namespace.as_ref(),
      );
      Ok(Self {
        name: snapshot.pod.metadata.name.clone(),
        namespace: snapshot.pod.metadata.namespace.clone(),
        labels: to_rune_map(snapshot.pod.metadata.labels.as_ref(), true)?,
        annotations: to_rune_map(None, true)?,
        metadata: RuneMetadata::from_missing_service(snapshot)?,
        spec: RuneServiceSpec {
          type_: None,
          cluster_ip: None,
          cluster_ips: to_rune_vec(Vec::<String>::new())?,
          external_ips: to_rune_vec(Vec::<String>::new())?,
          external_name: None,
          load_balancer_class: None,
          session_affinity: None,
          internal_traffic_policy: None,
          external_traffic_policy: None,
          ip_families: to_rune_vec(Vec::<String>::new())?,
          ip_family_policy: None,
          selector: to_rune_map(snapshot.pod.metadata.labels.as_ref(), false)?,
          ports: to_rune_vec(Vec::<RuneServicePort>::new())?,
        },
        status: RuneServiceStatus {
          load_balancer_ingress: to_rune_vec(Vec::<RuneLoadBalancerIngress>::new())?,
        },
        internal: RuneServiceInternalInfo {
          cluster_ip: None,
          cluster_ips: to_rune_vec(Vec::<String>::new())?,
          dns_names: to_rune_vec(dns_names)?,
          ports: to_rune_vec(Vec::<RuneServicePort>::new())?,
        },
        external: RuneServiceExternalInfo {
          external_name: None,
          external_ips: to_rune_vec(Vec::<String>::new())?,
          load_balancer_ingress: to_rune_vec(Vec::<RuneLoadBalancerIngress>::new())?,
          node_ports: to_rune_vec(Vec::<RuneServicePort>::new())?,
        },
      })
    }
  }
}

impl LifecycleContext {
  fn from_snapshot(
    snapshot: &ChallengeEnvSnapshot, user: LifecycleUserInfo, team: Option<LifecycleTeamInfo>,
    challenge: LifecycleChallengeInfo, reason: Option<String>,
  ) -> Result<Self, ClusterError> {
    Ok(Self {
      pod: RunePodInfo::from_pod(&snapshot.pod)?,
      service: RuneServiceInfo::from_snapshot(snapshot)?,
      user,
      team,
      challenge,
      reason,
    })
  }
}

impl LifecycleMapper {
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
    engine.expire(format!("lifecycle-{}", key.as_ref())).await
  }

  pub async fn lint(&self, script: impl AsRef<str>) -> Result<Vec<DiagnosticMarker>, EngineError> {
    Engine::lint(Self::default_modules(), script, &[]).await
  }

  pub async fn preload(
    &self, engine: &Engine, key: impl AsRef<str>, script: impl AsRef<str>,
  ) -> Result<(), EngineError> {
    let key = format!("lifecycle-{}", key.as_ref());
    engine
      .preload(Self::default_modules(), key, script, None)
      .await
  }

  pub async fn execute(
    &self, engine: &Engine, key: impl AsRef<str>, request: LifecycleExecutionRequest<'_>,
  ) -> Result<LifecycleExecutionStatus, ClusterError> {
    let key = format!("lifecycle-{}", key.as_ref());
    let function_name = request.event.function_name();
    if !engine.has_function(&key, function_name).await? {
      return Ok(LifecycleExecutionStatus::Skipped);
    }
    let ctx = LifecycleContext::from_snapshot(
      request.snapshot,
      request.user,
      request.team,
      request.challenge,
      request
        .event
        .reason()
        .map(|reason| reason.as_str().to_string()),
    )?;
    let _output: Value = engine.execute(key, function_name, (ctx,)).await?;
    Ok(LifecycleExecutionStatus::Executed)
  }
}

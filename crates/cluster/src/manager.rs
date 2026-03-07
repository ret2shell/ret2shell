use std::collections::{BTreeMap, HashMap};

use axum::extract::ws::WebSocket;
use chrono::{DateTime, Utc};
use futures_io::AsyncBufRead;
use k8s_openapi::{
  api::{
    core::v1::{
      Capabilities, ConfigMap, Container, ContainerPort, EnvVar, LocalObjectReference, Namespace,
      Node, Pod, PodSecurityContext, PodSpec, PodStatus, ResourceRequirements, SecurityContext,
      Service, Sysctl,
    },
    networking::v1::NetworkPolicy,
  },
  apimachinery::pkg::{api::resource::Quantity, version::Info},
  jiff,
};
use kube::{
  Api, Client,
  api::{DeleteParams, ListParams, LogParams, ObjectList, ObjectMeta, PartialObjectMetaExt, Patch},
  runtime::reflector::Lookup,
};
use r2s_config::cluster::{
  AppProtocol, ChallengeEnv, ChallengeImage, Config, Protocol, ServiceType,
};
use tokio_util::{codec::Framed, sync::CancellationToken};
use tracing::{debug, error, info, warn};

use super::traits::ClusterError;
use crate::{lifecycle::LifecycleMapper, registry::Registry, traffic::TrafficMapper};

pub const CHALLENGE_NS: &str = "ret2shell-challenge";

#[derive(Clone, Debug)]
pub struct ChallengeEnvSnapshot {
  pub pod: Pod,
  pub service: Option<Service>,
}

#[derive(Clone, Debug, Default)]
pub struct DeleteOutdatedEnvsResult {
  pub overloaded: bool,
  pub running: i32,
  pub pending: i32,
  pub deleted: Vec<ChallengeEnvSnapshot>,
}

#[derive(Clone)]
pub struct Cluster {
  client: Option<Client>,
  pub registry: Option<Registry>,
  namespace: Option<String>,
  pub traffic: Option<TrafficMapper>,
  pub lifecycle: Option<LifecycleMapper>,
}

macro_rules! with_namespace {
  ($ns: expr, $reason: expr) => {
    $ns
      .clone()
      .ok_or(ClusterError::NeedNamespace($reason.to_owned()))
  };
}

macro_rules! check_enabled {
  ($client: expr) => {
    if let Some(c) = $client.clone() {
      Ok(c)
    } else {
      Err(super::traits::ClusterError::ClusterDisabled)
    }
  };
}

impl Cluster {
  pub fn new(client: Option<Client>, config: &Config) -> Self {
    let registry = config
      .registry
      .as_ref()
      .map(|registry| Registry::new(registry.clone()));
    Self {
      client,
      registry,
      namespace: Some(String::from("default")),
      traffic: Some(TrafficMapper),
      lifecycle: Some(LifecycleMapper),
    }
  }

  /// Set the namespace for the cluster
  ///
  /// Example:
  ///
  /// ```rust
  /// cluster.at("challenge").some_operations().await;
  /// ```
  pub fn at(&self, namespace: &str) -> Self {
    Self {
      namespace: Some(namespace.to_owned()),
      ..self.to_owned()
    }
  }

  pub async fn version(&self) -> Result<Info, ClusterError> {
    let client = check_enabled!(self.client)?;
    let version = client.apiserver_version().await?;
    Ok(version)
  }

  pub async fn nodes(&self) -> Result<ObjectList<Node>, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Node> = Api::all(client);
    let nodes = api.list(&ListParams::default()).await?;
    Ok(nodes)
  }

  pub async fn namespaces(&self) -> Result<ObjectList<Namespace>, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Namespace> = Api::all(client);
    let namespaces = api.list(&ListParams::default()).await?;
    Ok(namespaces)
  }

  pub async fn configs(&self) -> Result<ObjectList<ConfigMap>, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<ConfigMap> = Api::all(client);
    let configs = api.list(&ListParams::default()).await?;
    Ok(configs)
  }

  pub async fn logs(
    &self, pod: String, container: Option<String>, follow: bool, tail_lines: Option<i64>,
    since_time: Option<DateTime<Utc>>,
  ) -> Result<impl AsyncBufRead, ClusterError> {
    let client = check_enabled!(self.client)?;
    let pods: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "logs")?);
    let logs = pods
      .log_stream(
        &pod,
        &LogParams {
          follow,
          container,
          tail_lines,
          since_time: since_time
            .map(|t| jiff::Timestamp::from_second(t.timestamp()).unwrap_or_default()),
          timestamps: true,
          ..LogParams::default()
        },
      )
      .await?;
    Ok(logs)
  }

  pub async fn create_namespace(&self, name: &str) -> Result<Namespace, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Namespace> = Api::all(client);
    let namespace = Namespace {
      metadata: ObjectMeta {
        name: Some(name.to_owned()),
        ..Default::default()
      },
      ..Default::default()
    };
    let namespace = api.create(&Default::default(), &namespace).await?;
    Ok(namespace)
  }

  pub async fn get_network_policies(&self) -> Result<ObjectList<NetworkPolicy>, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<NetworkPolicy> = Api::namespaced(
      client,
      &with_namespace!(&self.namespace, "get network policies")?,
    );
    let policies = api.list(&ListParams::default()).await?;
    Ok(policies)
  }

  pub async fn get_network_policy(
    &self, name: &str,
  ) -> Result<Option<NetworkPolicy>, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<NetworkPolicy> = Api::namespaced(
      client,
      &with_namespace!(&self.namespace, "get network policy")?,
    );
    let policy = api.get_opt(name).await?;
    Ok(policy)
  }

  pub async fn create_network_policy(
    &self, policy: NetworkPolicy,
  ) -> Result<NetworkPolicy, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<NetworkPolicy> = Api::namespaced(
      client,
      &with_namespace!(&self.namespace, "create network policy")?,
    );
    let policy = api.create(&Default::default(), &policy).await?;
    Ok(policy)
  }

  pub async fn delete_network_policy(&self, name: &str) -> Result<(), ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<NetworkPolicy> = Api::namespaced(
      client,
      &with_namespace!(&self.namespace, "delete network policy")?,
    );
    api.delete(name, &Default::default()).await?;
    Ok(())
  }

  pub async fn get_service(&self, name: &str) -> Result<Service, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Service> =
      Api::namespaced(client, &with_namespace!(&self.namespace, "get service")?);
    let service = api.get(name).await?;
    Ok(service)
  }

  pub async fn create_service(&self, service: Service) -> Result<Service, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Service> =
      Api::namespaced(client, &with_namespace!(&self.namespace, "create service")?);
    let service = api.create(&Default::default(), &service).await?;
    Ok(service)
  }

  pub async fn delete_service(&self, name: &str) -> Result<(), ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Service> =
      Api::namespaced(client, &with_namespace!(&self.namespace, "delete service")?);
    api.delete(name, &Default::default()).await?;
    Ok(())
  }

  pub async fn create_pod(&self, pod: Pod) -> Result<Pod, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "create pod")?);
    let pod = api.create(&Default::default(), &pod).await?;
    Ok(pod)
  }

  pub async fn renew_pod(&self, name: &str) -> Result<(), ClusterError> {
    let pod = self.get_pod(name).await?;
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "renew pod")?);
    let prev_renew = pod
      .metadata
      .annotations
      .clone()
      .unwrap_or_default()
      .get("ret.sh.cn/renew")
      .map(|v| v.parse::<i32>().unwrap_or(0))
      .unwrap_or(0);
    if prev_renew > 3 {
      warn!(pod=?name, "pod renew exceed limit");
      return Err(ClusterError::PodRenewExceedLimit(name.to_owned()));
    }
    let mut annotations = pod.metadata.annotations.clone().unwrap_or_default();
    annotations.insert("ret.sh.cn/renew".to_owned(), (prev_renew + 1).to_string());
    let metadata = ObjectMeta {
      annotations: Some(annotations),
      ..Default::default()
    }
    .into_request_partial::<Pod>();
    api
      .patch_metadata(name, &Default::default(), &Patch::Merge(metadata))
      .await?;
    Ok(())
  }

  pub async fn delete_pod(&self, name: &str) -> Result<(), ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "delete pod")?);
    api
      .delete(
        name,
        &DeleteParams {
          grace_period_seconds: Some(0),
          ..Default::default()
        },
      )
      .await?;
    Ok(())
  }

  async fn check_outdated_pod(&self, pod: &Pod) -> Result<bool, ClusterError> {
    let renew = pod
      .metadata
      .annotations
      .clone()
      .unwrap_or_default()
      .get("ret.sh.cn/renew")
      .map(|v| v.parse::<i32>().unwrap_or(0))
      .unwrap_or(0);
    let started_at = pod
      .metadata
      .creation_timestamp
      .clone()
      .ok_or(ClusterError::MissingField("creation_timestamp".to_string()))?
      .0
      .as_second();
    let now = Utc::now().timestamp();
    Ok(now - started_at > 3600 * (renew + 1) as i64)
  }

  pub async fn delete_outdated_envs(&self) -> Result<DeleteOutdatedEnvsResult, ClusterError> {
    // cleanup unknown services first
    self.cleanup_services().await?;
    // then check outdated pods, when pod is outdated, the corresponding service
    // will be deleted together
    self.delete_outdated_pods().await
  }

  async fn capture_service_snapshot(&self, pod: &Pod) -> Option<Service> {
    let name = pod.metadata.name.as_deref()?;
    match self.get_service(name).await {
      Ok(service) => Some(service),
      Err(err) => {
        warn!(pod=?pod.name(), error=?err, "failed to capture service snapshot");
        None
      }
    }
  }

  async fn delete_outdated_pods(&self) -> Result<DeleteOutdatedEnvsResult, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(
      client,
      &with_namespace!(&self.namespace, "delete outdated pods")?,
    );
    let pods = api
      .list(&ListParams {
        // field_selector: Some("status.phase!=Succeeded,status.phase!=Failed".to_owned()),
        ..Default::default()
      })
      .await?;
    let mut running = 0;
    let mut pending = 0;
    let mut deleted = Vec::new();
    let default_status = PodStatus {
      phase: Some("Unknown".to_owned()),
      ..Default::default()
    };
    let default_phase = "Unknown".to_owned();
    for pod in pods.items {
      let phase = pod
        .status
        .as_ref()
        .unwrap_or(&default_status)
        .phase
        .as_ref()
        .unwrap_or(&default_phase);
      match phase.as_str() {
        "Running" => running += 1,
        "Pending" => pending += 1,
        n => {
          warn!(
            pod=?pod.name(),
            status=?n,
            "deleting unknown pod",
          );
        }
      };
      match self.check_outdated_pod(&pod).await {
        Ok(true) => {
          let service = self.capture_service_snapshot(&pod).await;
          info!(pod=?pod.name(), "deleting outdated pod");
          api
            .delete(
              &pod.name().unwrap(),
              &DeleteParams {
                grace_period_seconds: Some(0),
                ..Default::default()
              },
            )
            .await?;
          self.delete_service(&pod.name().unwrap()).await.ok();
          deleted.push(ChallengeEnvSnapshot { pod, service });
        }
        Ok(false) => {
          debug!(pod=?pod.name(), "pod is alive");
        }
        Err(err) => {
          error!(
            pod=?pod.name(),
            error=?err,
            "failed to check outdated pod");
        }
      }
    }

    // if pending > 32, means that the cluster have too many pending pods
    // push a warning event to the queue
    Ok(DeleteOutdatedEnvsResult {
      overloaded: pending > 32,
      running,
      pending,
      deleted,
    })
  }

  async fn cleanup_services(&self) -> Result<(), ClusterError> {
    let api: Api<Service> = Api::namespaced(
      check_enabled!(self.client)?,
      &with_namespace!(&self.namespace, "delete outdated services")?,
    );
    let services = api.list(&ListParams::default()).await?;
    for service in services.items {
      // get service's label `ret.sh.cn/traffic`, and check the pod is still alive
      let traffic_label = service
        .metadata
        .labels
        .clone()
        .unwrap_or(BTreeMap::new())
        .get("ret.sh.cn/traffic")
        .cloned();
      if let Some(traffic) = traffic_label {
        let pod = self
          .get_pods_by_label(&format!("ret.sh.cn/traffic={traffic}"))
          .await?;
        if pod.is_empty() {
          info!(
            service=?service.name(),
            "deleting service without pod"
          );
          api
            .delete(
              &service.name().unwrap(),
              &DeleteParams {
                grace_period_seconds: Some(0),
                ..Default::default()
              },
            )
            .await?;
        }
      } else {
        warn!(
          service=?service.name(),
          "deleting unknown service"
        );
      }
    }
    Ok(())
  }

  pub async fn get_pod(&self, name: &str) -> Result<Pod, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "infer pod")?);
    let pod = api.get(name).await?;
    Ok(pod)
  }

  pub async fn get_pods_by_label(&self, label: &str) -> Result<Vec<Pod>, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "infer pod")?);
    let pod = api
      .list(&ListParams {
        label_selector: Some(label.to_owned()),
        field_selector: Some(
          "status.phase!=Succeeded,status.phase!=Failed,status.phase!=Unknown".to_owned(),
        ),
        ..Default::default()
      })
      .await?;
    Ok(pod.items)
  }

  pub async fn list_pods(&self) -> Result<ObjectList<Pod>, ClusterError> {
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "list pods")?);
    let pods = api.list(&ListParams::default()).await?;
    Ok(pods)
  }

  fn map_protocol(&self, image: &ChallengeImage) -> String {
    match image.protocol {
      Some(Protocol::Tcp) => "TCP".to_owned(),
      Some(Protocol::Udp) => "UDP".to_owned(),
      Some(Protocol::Stcp) => "STCP".to_owned(),
      #[allow(deprecated, reason = "for backward compatibility")]
      None => match image.service_type {
        Some(ServiceType::Http) => "TCP".to_owned(),
        Some(ServiceType::Tcp) => "TCP".to_owned(),
        Some(ServiceType::Udp) => "UDP".to_owned(),
        None => "TCP".to_owned(),
      },
    }
  }

  fn map_app_protocol(&self, image: &ChallengeImage) -> String {
    match image.app_protocol {
      Some(AppProtocol::Raw) => "raw".to_owned(),
      Some(AppProtocol::Http) => "http".to_owned(),
      #[allow(deprecated, reason = "for backward compatibility")]
      None => match image.service_type {
        Some(ServiceType::Http) => "http".to_owned(),
        Some(ServiceType::Tcp) => "raw".to_owned(),
        Some(ServiceType::Udp) => "raw".to_owned(),
        None => "raw".to_owned(),
      },
    }
  }

  pub async fn create_challenge_env(
    &self, labels: BTreeMap<String, String>, annotations: BTreeMap<String, String>,
    envs: HashMap<String, String>, env_config: ChallengeEnv, node_selector: Option<String>,
    need_expose: bool,
  ) -> Result<ChallengeEnvSnapshot, ClusterError> {
    let challenge_id = labels
      .get("ret.sh.cn/challenge")
      .ok_or(ClusterError::MissingField("challenge".to_string()))?;
    let user_id = labels
      .get("ret.sh.cn/user")
      .ok_or(ClusterError::MissingField("user".to_string()))?;
    let traffic = labels
      .get("ret.sh.cn/traffic")
      .ok_or(ClusterError::MissingField("traffic".to_string()))?;
    let pod_name = format!(
      "ret2shell-{challenge_id}-{user_id}-{}",
      Utc::now().timestamp()
    );
    let node_selector = if let Some(node_selector) = node_selector {
      let mut n = BTreeMap::new();
      n.insert("ret.sh.cn/workload".to_owned(), node_selector);
      Some(n)
    } else {
      None
    };
    let security_context = SecurityContext {
      allow_privilege_escalation: Some(false),
      capabilities: Some(Capabilities {
        drop: Some(vec!["NET_BIND_SERVICE".to_owned()]),
        ..Default::default()
      }),
      ..Default::default()
    };
    let pod_security_context = PodSecurityContext {
      sysctls: Some(vec![Sysctl {
        name: "net.ipv4.ip_unprivileged_port_start".to_owned(),
        value: "1024".to_owned(),
      }]),
      ..Default::default()
    };
    let pod = Pod {
      metadata: ObjectMeta {
        name: Some(pod_name.clone()),
        labels: Some(labels.clone()),
        annotations: Some(annotations),
        ..Default::default()
      },
      spec: Some(PodSpec {
        enable_service_links: Some(false),
        security_context: env_config
          .restricted
          .is_some_and(|r| r)
          .then_some(pod_security_context),
        image_pull_secrets: env_config
          .pull_secret
          .map(|secret| vec![LocalObjectReference { name: secret }]),
        containers: env_config
          .images
          .iter()
          .map(|image| Container {
            name: image.name.clone(),
            image: Some(image.tag.clone()),
            image_pull_policy: Some(String::from("Always")),
            env: Some(
              envs
                .clone()
                .into_iter()
                .map(|v| EnvVar {
                  name: v.0,
                  value: Some(v.1),
                  value_from: None,
                })
                .collect(),
            ),
            ports: image.port.map(|port| {
              vec![ContainerPort {
                container_port: port as i32,
                protocol: Some(self.map_protocol(image)),
                ..Default::default()
              }]
            }),
            resources: Some(ResourceRequirements {
              requests: Some(
                [
                  ("cpu", image.cpu_req.to_string()),
                  ("memory", image.mem_req.clone()),
                  (
                    "ephemeral-storage",
                    image.storage_req.clone().unwrap_or("64Mi".to_owned()),
                  ),
                ]
                .iter()
                .cloned()
                .map(|(k, v)| (k.to_owned(), Quantity(v)))
                .collect(),
              ),
              limits: Some(
                [
                  ("cpu", image.cpu.to_string()),
                  ("memory", image.mem.clone()),
                  (
                    "ephemeral-storage",
                    image.storage.clone().unwrap_or("3Gi".to_owned()),
                  ),
                ]
                .iter()
                .cloned()
                .map(|(k, v)| (k.to_owned(), Quantity(v)))
                .collect(),
              ),
              ..Default::default()
            }),
            security_context: image
              .restricted
              .is_some_and(|r| r)
              .then(|| security_context.clone()),
            ..Default::default()
          })
          .collect(),
        node_selector,
        ..Default::default()
      }),
      ..Default::default()
    };

    let service_type = if need_expose { "NodePort" } else { "ClusterIP" };
    let service = Service {
      metadata: ObjectMeta {
        name: Some(pod_name.clone()),
        labels: Some(labels.clone()),
        ..Default::default()
      },
      spec: Some(k8s_openapi::api::core::v1::ServiceSpec {
        // use ret.sh.cn/traffic as selector
        selector: Some(
          [("ret.sh.cn/traffic".to_owned(), traffic.clone())]
            .iter()
            .map(|(k, v)| (k.to_owned(), v.to_owned()))
            .collect(),
        ),
        type_: Some(service_type.to_owned()),
        ports: Some(
          env_config
            .images
            .iter()
            .filter_map(|image| {
              image
                .port
                .map(|port| k8s_openapi::api::core::v1::ServicePort {
                  app_protocol: Some(format!(
                    "ret.sh.cn/traffic-{}",
                    self.map_app_protocol(image)
                  )),
                  name: Some(image.name.clone()),
                  port: port as i32,
                  protocol: Some(self.map_protocol(image)),
                  target_port: Some(
                    k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(port as i32),
                  ),
                  ..Default::default()
                })
            })
            .collect(),
        ),
        ..Default::default()
      }),
      ..Default::default()
    };
    if let Some(svc_spec) = service.spec.clone()
      && svc_spec.ports.is_none_or(|p| p.is_empty())
    {
      return Err(ClusterError::MissingField("service ports".to_string()));
    }
    let pod = self.create_pod(pod).await?;
    debug!(?service, "created pod, creating service");
    match self.create_service(service).await {
      Ok(service) => Ok(ChallengeEnvSnapshot {
        pod,
        service: Some(service),
      }),
      Err(err) => {
        error!(pod=?pod_name, error=?err, "failed to create service, deleting pod");
        self.delete_pod(&pod_name).await?;
        Err(err)
      }
    }
  }

  pub async fn get_challenge_env(&self, challenge_id: i64) -> Result<Vec<Pod>, ClusterError> {
    let pod = self
      .get_pods_by_label(&format!("ret.sh.cn/challenge={challenge_id}"))
      .await?;
    Ok(pod)
  }

  pub async fn get_challenge_env_by_user(&self, user_id: i64) -> Result<Vec<Pod>, ClusterError> {
    let pod = self
      .get_pods_by_label(&format!("ret.sh.cn/user={user_id}"))
      .await?;
    Ok(pod)
  }

  pub async fn get_challenge_env_by_team(&self, team_id: i64) -> Result<Vec<Pod>, ClusterError> {
    let pod = self
      .get_pods_by_label(&format!("ret.sh.cn/team={team_id}"))
      .await?;
    Ok(pod)
  }

  fn challenge_member_selector(challenge_id: i64, member_kind: &str, member_id: i64) -> String {
    format!("ret.sh.cn/challenge={challenge_id},ret.sh.cn/{member_kind}={member_id}")
  }

  fn with_incremented_renew_annotation(mut pod: Pod) -> Pod {
    let renew = pod
      .metadata
      .annotations
      .as_ref()
      .and_then(|annotations| annotations.get("ret.sh.cn/renew"))
      .and_then(|value| value.parse::<i32>().ok())
      .unwrap_or_default();
    let annotations = pod.metadata.annotations.get_or_insert_default();
    annotations.insert("ret.sh.cn/renew".to_owned(), (renew + 1).to_string());
    pod
  }

  async fn delay_challenge_env_by_selector(
    &self, selector: &str,
  ) -> Result<Vec<ChallengeEnvSnapshot>, ClusterError> {
    let pods = self.get_pods_by_label(selector).await?;
    let mut snapshots = Vec::with_capacity(pods.len());
    for pod in &pods {
      self
        .renew_pod(pod.metadata.name.as_deref().unwrap())
        .await?;
      snapshots.push(ChallengeEnvSnapshot {
        pod: Self::with_incremented_renew_annotation(pod.clone()),
        service: self.capture_service_snapshot(pod).await,
      });
    }
    Ok(snapshots)
  }

  pub async fn delay_challenge_env_by_user(
    &self, challenge_id: i64, user_id: i64,
  ) -> Result<Vec<ChallengeEnvSnapshot>, ClusterError> {
    self
      .delay_challenge_env_by_selector(&Self::challenge_member_selector(
        challenge_id,
        "user",
        user_id,
      ))
      .await
  }

  pub async fn delay_challenge_env_by_team(
    &self, challenge_id: i64, team_id: i64,
  ) -> Result<Vec<ChallengeEnvSnapshot>, ClusterError> {
    self
      .delay_challenge_env_by_selector(&Self::challenge_member_selector(
        challenge_id,
        "team",
        team_id,
      ))
      .await
  }

  pub async fn stop_challenge_env_by_user(
    &self, challenge_id: i64, user_id: i64,
  ) -> Result<Vec<ChallengeEnvSnapshot>, ClusterError> {
    let pods = self
      .get_pods_by_label(&format!(
        "ret.sh.cn/challenge={challenge_id},ret.sh.cn/user={user_id}"
      ))
      .await?;
    let mut snapshots = Vec::new();
    for p in pods.iter() {
      let service = self.capture_service_snapshot(p).await;
      self.delete_pod(p.metadata.name.as_ref().unwrap()).await?;
      self
        .delete_service(p.metadata.name.as_ref().unwrap())
        .await?;
      snapshots.push(ChallengeEnvSnapshot {
        pod: p.clone(),
        service,
      });
    }
    Ok(snapshots)
  }

  pub async fn stop_challenge_env_by_team(
    &self, challenge_id: i64, team_id: i64,
  ) -> Result<Vec<ChallengeEnvSnapshot>, ClusterError> {
    let pod = self
      .get_pods_by_label(&format!(
        "ret.sh.cn/challenge={challenge_id},ret.sh.cn/team={team_id}"
      ))
      .await?;
    let mut snapshots = Vec::new();
    for p in pod.iter() {
      let service = self.capture_service_snapshot(p).await;
      self.delete_pod(p.metadata.name.as_ref().unwrap()).await?;
      self
        .delete_service(p.metadata.name.as_ref().unwrap())
        .await?;
      snapshots.push(ChallengeEnvSnapshot {
        pod: p.clone(),
        service,
      });
    }
    Ok(snapshots)
  }

  pub async fn wsrx_link(&self, token: &str, port: u16, ws: WebSocket) -> Result<(), ClusterError> {
    let pod = self
      .get_pods_by_label(&format!("ret.sh.cn/traffic={token}"))
      .await?;
    let pod = pod
      .first()
      .ok_or(ClusterError::PodNotFound(token.to_owned()))?;
    if !pod.spec.clone().is_some_and(|spec| {
      spec.containers.iter().any(|c| {
        c.ports
          .iter()
          .any(|p| p.iter().any(|p| p.container_port == (port as i32)))
      })
    }) {
      return Err(ClusterError::TrafficMapperNotFound(format!("port: {port}")));
    }
    let client = check_enabled!(self.client)?;
    let api: Api<Pod> = Api::namespaced(client, &with_namespace!(&self.namespace, "wsrx link")?);
    let mut pf = api.portforward(&pod.name().unwrap(), &[port]).await?;
    let pfw = pf.take_stream(port);
    if let Some(pfw) = pfw {
      let stream = Framed::new(pfw, wsrx::proxy::MessageCodec::new());
      let ws: wsrx::WrappedWsStream = ws.into();
      let cancel_token = CancellationToken::new();
      wsrx::proxy::proxy_stream(stream, ws, cancel_token).await?;
    }
    Ok(())
  }
}

use std::path::Path;

use k8s_openapi::{
  api::networking::v1::{NetworkPolicy, NetworkPolicySpec},
  apimachinery::pkg::apis::meta::v1::LabelSelector,
};
use kube::{
  Client, Config,
  api::ObjectMeta,
  config::{KubeConfigOptions, Kubeconfig},
};

pub mod lifecycle;
mod manager;
mod registry;
pub mod traffic;
mod traits;

pub use k8s_openapi::api::core::v1::{ConfigMap, Namespace, Node, Pod, Service};
pub use kube::api::ObjectList;
pub use manager::{
  CHALLENGE_NS, ChallengeEnvCreateOptions, ChallengeEnvSnapshot, Cluster, DeleteOutdatedEnvsResult,
};
use r2s_config::cluster;
pub use registry::{Registry, SyncImageMirrorRequest};
use tracing::{error, info};
pub use traits::ClusterError;

pub async fn initialize(config: &Option<cluster::Config>) -> Result<Cluster, ClusterError> {
  let config = config.clone().ok_or(ClusterError::ConfigNeeded)?;
  if !config.enabled {
    return Ok(Cluster::new(None, &config));
  }
  let client = if config.try_default.is_some_and(|t| t) {
    Client::try_default().await?
  } else if config.auto_infer.is_some_and(|t| t) {
    Client::try_from(Config::infer().await?)?
  } else {
    let kube_config_path = config.kube_config_path.as_ref().unwrap();
    let kube_config_path = Path::new(kube_config_path);
    let kube_config = Kubeconfig::read_from(kube_config_path)?;
    let kube_config =
      Config::from_custom_kubeconfig(kube_config, &KubeConfigOptions::default()).await?;
    Client::try_from(kube_config)?
  };
  let client = Cluster::new(Some(client), &config);
  check_namespace(&client).await?;
  check_network_policy(&client).await?;
  Ok(client)
}

async fn check_namespace(client: &Cluster) -> Result<(), ClusterError> {
  let namespaces = client.namespaces().await?;
  let mut found = false;
  for namespace in namespaces.items {
    if namespace.metadata.name == Some(CHALLENGE_NS.to_owned()) {
      found = true;
      break;
    }
  }
  if !found {
    info!(
      namespace = "ret2shell-challenge",
      "creating namespace in cluster..."
    );
    client.create_namespace(CHALLENGE_NS).await?;
  } else {
    info!(
      namespace = "ret2shell-challenge",
      "namespace already exists in cluster, skipping..."
    );
  }
  info!(
    namespace = "ret2shell-challenge",
    "NOTE: this namespace is used for challenge deployment, the pod will be managed automatically by Ret2Shell, please don't operate on it manually."
  );
  Ok(())
}

async fn check_network_policy(client: &Cluster) -> Result<(), ClusterError> {
  let api = client.at(CHALLENGE_NS);
  match api.get_network_policy("internet-disabled").await {
    Ok(Some(_)) => {
      info!(
        namespace = "ret2shell-challenge",
        policy = "internet-disabled",
        "network policy already exists in cluster, skipping..."
      );
    }
    Ok(None) => {
      info!(
        namespace = "ret2shell-challenge",
        policy = "internet-disabled",
        "creating network policy in cluster..."
      );
      let policy = NetworkPolicy {
        metadata: ObjectMeta {
          name: Some("internet-disabled".to_owned()),
          namespace: Some(CHALLENGE_NS.to_owned()),
          ..Default::default()
        },
        spec: Some(NetworkPolicySpec {
          pod_selector: Some(LabelSelector {
            match_labels: Some(
              [("ret.sh.cn/internet".to_owned(), "false".to_owned())]
                .iter()
                .cloned()
                .collect(),
            ),
            ..Default::default()
          }),
          policy_types: Some(vec!["Egress".to_owned()]),
          ..Default::default()
        }),
      };
      api.create_network_policy(policy).await?;
    }
    Err(err) => {
      error!(error=?err, policy="internet-disabled", "failed to get network policy in cluster");
      return Err(err);
    }
  }
  Ok(())
}

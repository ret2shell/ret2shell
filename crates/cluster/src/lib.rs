use std::path::Path;

use k8s_openapi::{
  api::networking::v1::{NetworkPolicy, NetworkPolicySpec},
  apimachinery::pkg::apis::meta::v1::LabelSelector,
};
use kube::{
  api::ObjectMeta,
  config::{KubeConfigOptions, Kubeconfig},
  Client, Config,
};

mod manager;
mod registry;
pub mod traffic;
mod traits;

pub use k8s_openapi::api::core::v1::{ConfigMap, Namespace, Node, Pod};
pub use kube::api::ObjectList;
pub use manager::{Cluster, CHALLENGE_NS};
use r2s_config::cluster;
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
  let cluster = client.clone();
  tokio::spawn(async move {
    cluster.traffic.unwrap().cleanup_worker().await;
  });
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
    info!("Creating namespace `ret2shell-challenge` in cluster...");
    client.create_namespace(CHALLENGE_NS).await?;
  } else {
    info!("Namespace `ret2shell-challenge` already exists in cluster, skipping...");
  }
  info!("Note: `ret2shell-challenge` namespace is used for challenge deployment, the pod will be managed automatically by Ret2Shell, please don't operate on it manually.");
  Ok(())
}

async fn check_network_policy(client: &Cluster) -> Result<(), ClusterError> {
  let api = client.at(CHALLENGE_NS);
  match api.get_network_policy("internet-disabled").await {
    Ok(Some(_)) => {
      info!("Network policy `internet-disabled` already exists in cluster, skipping...");
    }
    Ok(None) => {
      info!("Creating network policy `internet-disabled` in cluster...");
      let policy = NetworkPolicy {
        metadata: ObjectMeta {
          name: Some("internet-disabled".to_owned()),
          namespace: Some(CHALLENGE_NS.to_owned()),
          ..Default::default()
        },
        spec: Some(NetworkPolicySpec {
          pod_selector: LabelSelector {
            match_labels: Some(
              [("ret.sh.cn/internet".to_owned(), "false".to_owned())]
                .iter()
                .cloned()
                .collect(),
            ),
            ..Default::default()
          },
          policy_types: Some(vec!["Egress".to_owned()]),
          ..Default::default()
        }),
      };
      api.create_network_policy(policy).await?;
    }
    Err(err) => {
      error!("Failed to get network policy `internet-disabled` in cluster: {err:?}");
      return Err(err);
    }
  }
  Ok(())
}

use std::path::Path;

use kube::{
    config::{KubeConfigOptions, Kubeconfig},
    Client, Config,
};

mod manager;
mod traits;

pub use manager::Cluster;
use r2s_config::cluster;
use tracing::info;
pub use traits::ClusterError;

pub use k8s_openapi::api::core::v1::{ConfigMap, Namespace, Node, Pod};
pub use kube::api::ObjectList;

pub async fn initialize(config: &Option<cluster::Config>) -> Result<Cluster, ClusterError> {
    let config = config.clone().ok_or(ClusterError::ConfigNeeded)?;
    if !config.enabled {
        return Ok(Cluster::new(None));
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
    let client = Cluster::new(Some(client));
    let namespaces = client.namespaces().await?;
    let mut found = false;
    for namespace in namespaces.items {
        if namespace.metadata.name == Some("ret2shell-challenge".to_owned()) {
            found = true;
            break;
        }
    }
    if !found {
        info!("Creating namespace `ret2shell-challenge` in cluster...");
        client.create_namespace("ret2shell-challenge").await?;
    } else {
        info!("Namespace `ret2shell-challenge` already exists in cluster, skipping...");
    }
    info!("Note: `ret2shell-challenge` namespace is used for challenge deployment, the pod will be managed automatically by Ret2Shell, please don't operate on it manually.");
    Ok(client)
}

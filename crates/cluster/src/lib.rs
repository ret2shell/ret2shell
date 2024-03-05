use kube::{
    config::{KubeConfigOptions, Kubeconfig},
    Client, Config,
};

mod manager;
mod traits;

pub use manager::Cluster;
pub use traits::{ClusterConfig, ClusterError};

pub async fn initialize(config: ClusterConfig) -> Result<Cluster, ClusterError> {
    let client = if config.try_default {
        Client::try_default().await?
    } else if config.auto_infer {
        Client::try_from(Config::infer().await?)?
    } else {
        let kube_config = Kubeconfig::read_from(config.kube_config_path.as_ref().unwrap())?;
        let kube_config =
            Config::from_custom_kubeconfig(kube_config, &KubeConfigOptions::default()).await?;
        Client::try_from(kube_config)?
    };
    Ok(Cluster::new(client))
}

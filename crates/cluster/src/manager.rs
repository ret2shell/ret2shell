use chrono::{DateTime, Utc};
use futures_io::AsyncBufRead;
use k8s_openapi::{
    api::core::v1::{ConfigMap, Namespace, Node, Pod},
    apimachinery::pkg::version::Info,
};
use kube::{
    api::{ListParams, LogParams, ObjectList, ObjectMeta},
    Api, Client,
};

use super::traits::ClusterError;

#[derive(Clone)]
pub struct Cluster {
    client: Client,
    namespace: Option<String>,
}

macro_rules! with_namespace {
    ($ns: expr, $reason: expr) => {
        $ns.clone()
            .ok_or(ClusterError::NeedNamespace($reason.to_owned()))
    };
}

impl Cluster {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            namespace: Some(String::from("default")),
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
        let version = self.client.apiserver_version().await?;
        Ok(version)
    }

    pub async fn nodes(&self) -> Result<ObjectList<Node>, ClusterError> {
        let api: Api<Node> = Api::all(self.client.clone());
        let nodes = api.list(&ListParams::default()).await?;
        Ok(nodes)
    }

    pub async fn namespaces(&self) -> Result<ObjectList<Namespace>, ClusterError> {
        let api: Api<Namespace> = Api::all(self.client.clone());
        let namespaces = api.list(&ListParams::default()).await?;
        Ok(namespaces)
    }

    pub async fn configs(&self) -> Result<ObjectList<ConfigMap>, ClusterError> {
        let api: Api<ConfigMap> = Api::all(self.client.clone());
        let configs = api.list(&ListParams::default()).await?;
        Ok(configs)
    }

    pub async fn logs(
        &self, pod: String, container: Option<String>, follow: bool, tail_lines: Option<i64>,
        since_time: Option<DateTime<Utc>>,
    ) -> Result<impl AsyncBufRead, ClusterError> {
        let pods: Api<Pod> = Api::namespaced(
            self.client.clone(),
            &with_namespace!(&self.namespace, "logs")?,
        );
        let logs = pods
            .log_stream(
                &pod,
                &LogParams {
                    follow,
                    container,
                    tail_lines,
                    since_time,
                    timestamps: true,
                    ..LogParams::default()
                },
            )
            .await?;
        Ok(logs)
    }

    pub async fn create_namespace(&self, name: &str) -> Result<Namespace, ClusterError> {
        let api: Api<Namespace> = Api::all(self.client.clone());
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

    pub async fn create_pod(&self, pod: Pod) -> Result<Pod, ClusterError> {
        let api: Api<Pod> = Api::namespaced(
            self.client.clone(),
            &with_namespace!(&self.namespace, "create pod")?,
        );
        let pod = api.create(&Default::default(), &pod).await?;
        Ok(pod)
    }

    pub async fn delete_pod(&self, name: &str) -> Result<(), ClusterError> {
        let api: Api<Pod> = Api::namespaced(
            self.client.clone(),
            &with_namespace!(&self.namespace, "delete pod")?,
        );
        api.delete(name, &Default::default()).await?;
        Ok(())
    }

    pub async fn infer_pod(&self, name: &str) -> Result<Pod, ClusterError> {
        let api: Api<Pod> = Api::namespaced(
            self.client.clone(),
            &with_namespace!(&self.namespace, "infer pod")?,
        );
        let pod = api.get(name).await?;
        Ok(pod)
    }
}

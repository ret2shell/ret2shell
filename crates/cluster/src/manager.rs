use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use futures_io::AsyncBufRead;
use k8s_openapi::api::core::v1::{ConfigMap, Namespace, Node, Pod};
use kube::{
    api::{ListParams, LogParams, ObjectMeta},
    Api, Client,
};
use serde::Serialize;

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

    pub fn at(&self, namespace: &str) -> Self {
        Self {
            namespace: Some(namespace.to_owned()),
            ..self.to_owned()
        }
    }

    pub async fn version(&self) -> Result<impl Serialize, ClusterError> {
        let version = self.client.apiserver_version().await?;
        Ok(version)
    }

    pub async fn nodes(&self) -> Result<impl Serialize, ClusterError> {
        let api: Api<Node> = Api::all(self.client.clone());
        let nodes = api.list(&ListParams::default()).await?;
        Ok(nodes)
    }

    pub async fn namespaces(&self) -> Result<impl Serialize, ClusterError> {
        let api: Api<Namespace> = Api::all(self.client.clone());
        let namespaces = api.list(&ListParams::default()).await?;
        Ok(namespaces)
    }

    pub async fn configs(&self) -> Result<impl Serialize, ClusterError> {
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

    pub async fn create_namespace(
        &self, name: &str, label: &str, label_value: &str,
    ) -> Result<impl Serialize, ClusterError> {
        let api: Api<Namespace> = Api::all(self.client.clone());
        let namespace = Namespace {
            metadata: ObjectMeta {
                name: Some(name.to_owned()),
                labels: Some({
                    let mut labels = BTreeMap::new();
                    labels.insert(label.to_owned(), label_value.to_owned());
                    labels
                }),
                ..Default::default()
            },
            ..Default::default()
        };
        let namespace = api.create(&Default::default(), &namespace).await?;
        Ok(namespace)
    }
}

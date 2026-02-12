use sea_orm::FromJsonQueryResult;
/// Configuration for service settings.
use serde::{Deserialize, Serialize};

use crate::traits::Merge;

#[derive(Serialize, Deserialize, Clone, Debug, Default, FromJsonQueryResult, PartialEq, Eq)]
pub struct RegistryConfig {
  pub username: Option<String>,
  pub password: Option<String>,
  pub server: String,
  pub insecure: bool,
  pub external: String,
  pub enabled: Option<bool>,
}

/// `ClusterConfig` is a configuration struct for managing service settings.
#[derive(Serialize, Deserialize, Clone, Debug, Default, FromJsonQueryResult, PartialEq, Eq)]
pub struct Config {
  pub enabled: bool,
  /// `try_default` is a flag to try to use the default service account.
  /// maybe useful when running ret2shell inside a kubernetes cluster,
  /// and want to use the same cluster to launch challenge pods.
  pub try_default: Option<bool>,
  /// `auto_infer` is a flag to try to infer the kube config path.
  /// only available when `try_default` is false.
  pub auto_infer: Option<bool>,
  /// `kube_config_path` is the path to the kube config file.
  /// necessary when `try_default` and `auto_infer` both are false.
  pub kube_config_path: Option<String>,
  /// `challenge_node_selector` is the node selector for challenge pods.
  /// it will be used as `ret.sh.cn/workload=<challenge_node_selector>`,
  /// you should setup the node selector in your kubernetes cluster first.
  pub node_selector: Option<String>,
  /// the `traffic` script for challenge routes.
  pub traffic: Option<String>,
  /// `enable_capture` is a flag to enable the stream capture feature.
  pub enable_capture: Option<bool>,
  /// `capture_directory` is the directory to store the capture files.
  pub capture_directory: Option<String>,
  /// `cleanup_interval` is the interval to cleanup the challenge pods.
  /// DEPRECATED: not configurable anymore.
  // pub cleanup_interval: Option<u64>,
  /// `registry` is the private registry for challenge images.
  pub registry: Option<RegistryConfig>,
}

impl Merge for Option<Config> {
  fn merge(self, other: Self) -> Self {
    // prefers fields in `other`
    match (self, other) {
      (Some(a), Some(b)) => Some(Config {
        enabled: a.enabled,
        try_default: a.try_default,
        auto_infer: a.auto_infer,
        kube_config_path: a.kube_config_path,
        node_selector: b.node_selector.or(a.node_selector),
        traffic: b.traffic,
        enable_capture: b.enable_capture.or(a.enable_capture),
        capture_directory: b.capture_directory.or(a.capture_directory),
        registry: a.registry,
      }),
      (Some(a), None) => Some(a),
      (None, Some(b)) => Some(b),
      (None, None) => None,
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceType {
  Http,
  Tcp,
  Udp,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
  Tcp,
  Stcp,
  Udp,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AppProtocol {
  Raw,
  Http,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChallengeImage {
  pub name: String,
  pub tag: String,
  pub cpu: f64,
  #[serde(default = "default_cpu_req")]
  pub cpu_req: f64,
  pub mem: String,
  #[serde(default = "default_mem_req")]
  pub mem_req: String,
  pub storage: Option<String>,
  #[serde(default = "default_storage_req")]
  pub storage_req: Option<String>,
  pub port: Option<u16>,
  #[deprecated(since="3.10.2", note = "use protocol and app_protocol instead")]
  pub service_type: Option<ServiceType>,
  pub protocol: Option<Protocol>,
  pub app_protocol: Option<AppProtocol>,
  pub description: Option<String>,
  pub restricted: Option<bool>,
}

fn default_cpu_req() -> f64 {
  0.01
}

fn default_mem_req() -> String {
  "32Mi".to_string()
}

fn default_storage_req() -> Option<String> {
  Some("64Mi".to_string())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChallengeEnv {
  pub internet: bool,
  pub restricted: Option<bool>,
  pub images: Vec<ChallengeImage>,
  pub pull_secret: Option<String>,
}

impl ChallengeImage {
  pub fn desensitize(self) -> Self {
    Self {
      tag: "ret.sh.cn/shadowed:latest".to_string(),
      cpu: 0.0,
      cpu_req: 0.0,
      mem: "NaN".to_string(),
      mem_req: "NaN".to_string(),
      storage: None,
      storage_req: None,
      ..self
    }
  }
}

impl ChallengeEnv {
  pub fn desensitize(self) -> Self {
    Self {
      internet: false,
      restricted: None,
      images: self.images.into_iter().map(|i| i.desensitize()).collect(),
      pull_secret: None,
    }
  }
}

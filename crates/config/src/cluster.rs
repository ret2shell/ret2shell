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
  /// the `lifecycle` script for challenge instance events.
  pub lifecycle: Option<String>,
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
        lifecycle: b.lifecycle,
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
  #[serde(default)]
  pub internal_managed: bool,
  pub internal_tag: Option<String>,
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
  #[deprecated(since = "3.10.2", note = "use protocol and app_protocol instead")]
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
  fn normalized_internal_tag(&self) -> Option<&str> {
    self
      .internal_tag
      .as_deref()
      .map(str::trim)
      .map(|tag| tag.trim_matches('/'))
      .filter(|tag| !tag.is_empty())
  }

  pub fn managed_image_tag(
    &self, internal_registry_external: Option<&str>, image_namespace: Option<&str>,
  ) -> Option<String> {
    if !self.internal_managed {
      return None;
    }

    let internal_registry_external = internal_registry_external
      .map(str::trim)
      .map(|host| host.trim_end_matches('/'))
      .filter(|host| !host.is_empty())?;
    let image_namespace = image_namespace
      .map(str::trim)
      .map(|namespace| namespace.trim_matches('/'))
      .filter(|namespace| !namespace.is_empty())?;
    let internal_tag = self.normalized_internal_tag()?;

    Some(format!(
      "{internal_registry_external}/{image_namespace}/{internal_tag}"
    ))
  }

  pub fn resolved_tag(
    &self, internal_registry_external: Option<&str>, image_namespace: Option<&str>,
  ) -> String {
    self
      .managed_image_tag(internal_registry_external, image_namespace)
      .unwrap_or_else(|| self.tag.clone())
  }

  pub fn desensitize(self) -> Self {
    let internal_tag = self
      .internal_tag
      .as_ref()
      .map(|_| "shadowed:latest".to_string());
    Self {
      tag: "ret.sh.cn/shadowed:latest".to_string(),
      internal_tag,
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

#[cfg(test)]
mod tests {
  use super::{AppProtocol, ChallengeEnv, ChallengeImage, Config, Protocol, RegistryConfig};
  use crate::traits::Merge;

  fn registry() -> RegistryConfig {
    RegistryConfig {
      username: Some("ci".to_owned()),
      password: Some("secret".to_owned()),
      server: "registry.example.com".to_owned(),
      insecure: false,
      external: "registry.example.com".to_owned(),
      enabled: Some(true),
    }
  }

  #[allow(deprecated)]
  fn image(name: &str) -> ChallengeImage {
    ChallengeImage {
      name: name.to_owned(),
      tag: "challenge:latest".to_owned(),
      internal_managed: false,
      internal_tag: None,
      cpu: 1.5,
      cpu_req: 1.0,
      mem: "512Mi".to_owned(),
      mem_req: "256Mi".to_owned(),
      storage: Some("2Gi".to_owned()),
      storage_req: Some("1Gi".to_owned()),
      port: Some(8080),
      service_type: None,
      protocol: Some(Protocol::Tcp),
      app_protocol: Some(AppProtocol::Http),
      description: Some("web challenge".to_owned()),
      restricted: Some(true),
    }
  }

  #[test]
  fn merge_prefers_overrideable_fields_without_losing_base_connection_settings() {
    let base = Some(Config {
      enabled: true,
      try_default: Some(false),
      auto_infer: Some(true),
      kube_config_path: Some("/etc/kube/config".to_owned()),
      node_selector: Some("general".to_owned()),
      traffic: Some("base-traffic".to_owned()),
      lifecycle: Some("base-lifecycle".to_owned()),
      enable_capture: Some(false),
      capture_directory: Some("/var/lib/r2s/capture".to_owned()),
      registry: Some(registry()),
    });
    let overlay = Some(Config {
      enabled: false,
      try_default: Some(true),
      auto_infer: Some(false),
      kube_config_path: Some("/tmp/ignored".to_owned()),
      node_selector: Some("gpu".to_owned()),
      traffic: Some("overlay-traffic".to_owned()),
      lifecycle: Some("overlay-lifecycle".to_owned()),
      enable_capture: Some(true),
      capture_directory: None,
      registry: None,
    });

    let merged = base.merge(overlay).unwrap();

    assert!(merged.enabled);
    assert_eq!(merged.try_default, Some(false));
    assert_eq!(merged.auto_infer, Some(true));
    assert_eq!(merged.kube_config_path.as_deref(), Some("/etc/kube/config"));
    assert_eq!(merged.node_selector.as_deref(), Some("gpu"));
    assert_eq!(merged.traffic.as_deref(), Some("overlay-traffic"));
    assert_eq!(merged.lifecycle.as_deref(), Some("overlay-lifecycle"));
    assert_eq!(merged.enable_capture, Some(true));
    assert_eq!(
      merged.capture_directory.as_deref(),
      Some("/var/lib/r2s/capture")
    );
    assert_eq!(merged.registry, Some(registry()));
  }

  #[test]
  fn challenge_image_desensitize_redacts_resource_details_but_preserves_identity() {
    let desensitized = image("web").desensitize();

    assert_eq!(desensitized.name, "web");
    assert_eq!(desensitized.tag, "ret.sh.cn/shadowed:latest");
    assert_eq!(desensitized.internal_tag, None);
    assert_eq!(desensitized.cpu, 0.0);
    assert_eq!(desensitized.cpu_req, 0.0);
    assert_eq!(desensitized.mem, "NaN");
    assert_eq!(desensitized.mem_req, "NaN");
    assert_eq!(desensitized.storage, None);
    assert_eq!(desensitized.storage_req, None);
    assert_eq!(desensitized.port, Some(8080));
    assert_eq!(desensitized.protocol, Some(Protocol::Tcp));
    assert_eq!(desensitized.app_protocol, Some(AppProtocol::Http));
  }

  #[test]
  fn challenge_env_desensitize_redacts_network_and_pull_credentials() {
    let desensitized = ChallengeEnv {
      internet: true,
      restricted: Some(true),
      images: vec![image("web")],
      pull_secret: Some("registry-secret".to_owned()),
    }
    .desensitize();

    assert!(!desensitized.internet);
    assert_eq!(desensitized.restricted, None);
    assert_eq!(desensitized.pull_secret, None);
    assert_eq!(desensitized.images.len(), 1);
    assert_eq!(desensitized.images[0].tag, "ret.sh.cn/shadowed:latest");
    assert_eq!(desensitized.images[0].internal_tag, None);
    assert_eq!(desensitized.images[0].cpu, 0.0);
  }

  #[test]
  fn challenge_image_resolved_tag_prefers_internal_registry_reference() {
    let mut challenge_image = image("web");
    challenge_image.internal_managed = true;
    challenge_image.internal_tag = Some("web:main".to_owned());

    assert_eq!(
      challenge_image.resolved_tag(Some("registry.example.com"), Some("example_game")),
      "registry.example.com/example_game/web:main"
    );
    assert_eq!(
      challenge_image.resolved_tag(None, Some("example_game")),
      "challenge:latest"
    );
    assert_eq!(
      challenge_image.resolved_tag(Some("registry.example.com"), None),
      "challenge:latest"
    );
  }

  #[test]
  fn challenge_image_deserializes_without_internal_fields() {
    let image: ChallengeImage = toml::from_str(
      r#"
name = "web"
tag = "registry.example.com/example/web:latest"
cpu = 0.5
mem = "128Mi"
"#,
    )
    .unwrap();

    assert!(!image.internal_managed);
    assert_eq!(image.internal_tag, None);
    assert_eq!(image.cpu_req, 0.01);
    assert_eq!(image.mem_req, "32Mi");
  }
}

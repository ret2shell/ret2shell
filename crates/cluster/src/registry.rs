use std::collections::HashMap;

use chrono::Utc;
use deunicode::deunicode_with_tofu;
use r2s_config::cluster::RegistryConfig;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncRead, process::Command};
use tracing::{debug, info, warn};

use crate::ClusterError;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Registry {
  credentials: Option<RegistryConfig>,
}

#[derive(Deserialize)]
struct Repository {
  repositories: Vec<String>,
}

#[derive(Deserialize)]
struct Tags {
  tags: Vec<String>,
}

impl Registry {
  pub fn new(c: RegistryConfig) -> Self {
    Self {
      credentials: Some(c),
    }
  }

  fn base(&self) -> Result<String, ClusterError> {
    let credentials = self
      .credentials
      .as_ref()
      .ok_or(ClusterError::ConfigNeeded)?;
    if let Some(ref username) = credentials.username {
      if let Some(ref password) = credentials.password {
        Ok(format!(
          "{}:{}@{}",
          username,
          password,
          credentials.server.clone()
        ))
      } else {
        Err(ClusterError::MissingField("password".to_string()))
      }
    } else {
      Ok(credentials.server.clone())
    }
  }

  fn api_base(&self) -> Result<String, ClusterError> {
    let credentials = self
      .credentials
      .as_ref()
      .ok_or(ClusterError::ConfigNeeded)?;
    Ok(format!(
      "{}://{}/v2",
      if credentials.insecure {
        "http"
      } else {
        "https"
      },
      credentials.server.clone()
    ))
  }

  fn authenticate(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match self
      .credentials
      .as_ref()
      .and_then(RegistryConfig::basic_auth)
    {
      Some((username, password)) => request.basic_auth(username, Some(password)),
      None => request,
    }
  }

  async fn get(&self, url: &str) -> Result<reqwest::Response, ClusterError> {
    Ok(
      self
        .authenticate(reqwest::Client::new().get(url))
        .send()
        .await?,
    )
  }

  pub async fn sync_repo(&mut self) -> Result<HashMap<String, Vec<String>>, ClusterError> {
    let api_base = self.api_base()?;
    let mut result: Vec<String> = Vec::new();
    let mut last = String::new();
    let mut orgs: HashMap<String, Vec<String>> = HashMap::new();
    loop {
      let res = match last {
        ref s if s.is_empty() => self.get(&format!("{api_base}/_catalog?n=1000")).await?,
        ref s => {
          self
            .get(&format!("{api_base}/_catalog?n=1000&last={s}"))
            .await?
        }
      };
      let body: Repository = res.json().await?;
      let repositories = body.repositories;
      if repositories.is_empty() {
        break;
      }
      last = repositories.last().unwrap().clone();
      result.extend(repositories);
    }
    for i in result {
      if i.contains('/') {
        let org = i.split('/').next().unwrap();
        let repo = i.split('/').next_back().unwrap();
        orgs
          .entry(org.to_string())
          .or_default()
          .push(repo.to_string());
      } else {
        orgs.entry("_".to_string()).or_default().push(i);
      }
    }
    Ok(orgs)
  }

  pub async fn images(&self, repository: &str) -> Result<Vec<String>, ClusterError> {
    let api_base = self.api_base()?;
    let res = self
      .get(&format!("{api_base}/{repository}/tags/list"))
      .await?;
    let body: Tags = res.json().await?;
    Ok(body.tags)
  }

  /// Resolves the digest a repository reference currently points to. The
  /// digest is the content-addressed identity of the manifest (or manifest
  /// list), so comparing digests proves image content equality even when the
  /// tag itself is mutable.
  pub async fn manifest_digest(
    &self, repository: &str, reference: &str,
  ) -> Result<String, ClusterError> {
    if repository.is_empty() || reference.is_empty() {
      return Err(ClusterError::UploadFailed(
        "repository and reference must not be empty".to_owned(),
      ));
    }
    let api_base = self.api_base()?;
    let response = self
      .authenticate(
        reqwest::Client::new()
          .head(format!("{api_base}/{repository}/manifests/{reference}"))
          .header(
            reqwest::header::ACCEPT,
            "application/vnd.docker.distribution.manifest.v2+json, \
             application/vnd.docker.distribution.manifest.list.v2+json, \
             application/vnd.oci.image.manifest.v1+json, \
             application/vnd.oci.image.index.v1+json, \
             application/vnd.docker.distribution.manifest.v1+json",
          ),
      )
      .send()
      .await?;
    if !response.status().is_success() {
      return Err(ClusterError::UploadFailed(format!(
        "registry returned {} for {repository}:{reference}",
        response.status()
      )));
    }
    let digest = response
      .headers()
      .get("docker-content-digest")
      .and_then(|value| value.to_str().ok())
      .map(str::trim)
      .filter(|digest| digest.starts_with("sha256:"))
      .ok_or_else(|| {
        ClusterError::UploadFailed(format!(
          "registry did not return a content digest for {repository}:{reference}"
        ))
      })?;
    Ok(digest.to_owned())
  }

  pub async fn upload_image(
    &self, org: &str, name: &str, mut stdin: impl AsyncRead + Send + Unpin,
  ) -> Result<(), ClusterError> {
    if !(name.ends_with(".tar")
      || name.ends_with(".tar.gz")
      || name.ends_with(".tgz")
      || name.ends_with(".tar.zst"))
    {
      return Err(ClusterError::InvalidImageFileType(
        "only support tar/tar.gz/tgz/tar.zst files".to_string(),
      ));
    }
    let tmp_dir = std::env::temp_dir().join("ret2shell");
    if !tmp_dir.exists() {
      tokio::fs::create_dir_all(&tmp_dir).await?;
    }
    let file_path = tmp_dir.join(name);
    let file_parent_dir = file_path
      .parent()
      .ok_or(ClusterError::PathTraversalDetected(
        file_path.to_string_lossy().to_string(),
      ))?;
    if !file_parent_dir.canonicalize()?.starts_with(&tmp_dir) {
      return Err(ClusterError::PathTraversalDetected(
        file_path.to_string_lossy().to_string(),
      ));
    }
    let mut file = tokio::fs::File::create(&file_path).await?;
    debug!(path=?file_path, "uploading file to path");
    tokio::io::copy(&mut stdin, &mut file).await?;
    // get tag name without file extension
    let repo = to_image_name(name.split('.').next().unwrap());
    let version = Utc::now().timestamp();
    let mut args = vec![
      "copy".to_string(),
      format!("docker-archive:{}", name),
      format!("docker://{}/{org}/{repo}:{version}", self.base()?),
    ];
    if self.credentials.clone().is_some_and(|c| c.insecure) {
      args.push("--dest-tls-verify=false".to_string());
    }
    let output = Command::new("skopeo")
      .current_dir(&tmp_dir)
      .args(&args)
      .output()
      .await?;
    if output.status.success() {
      info!(?name, ?org, ?repo, ?version, "uploaded image");
      Ok(())
    } else {
      let error = String::from_utf8_lossy(&output.stderr).to_string();
      warn!(?error, "upload image failed");
      Err(ClusterError::UploadFailed(error))
    }
  }
  /// Copies an image between two registries with `skopeo copy --all`, so the
  /// manifest (or manifest list) and every referenced blob are transferred
  /// verbatim and the destination digest equals the source digest. Registry
  /// credentials travel through a temporary authfile instead of the process
  /// argv, mirroring the sync token handling of the instance sync.
  pub async fn copy_image(
    source: &RegistryConfig, destination: &RegistryConfig, repository: &str, tag: &str,
  ) -> Result<(), ClusterError> {
    if repository.is_empty() || tag.is_empty() {
      return Err(ClusterError::UploadFailed(
        "repository and tag must not be empty".to_owned(),
      ));
    }
    let tmp_dir = std::env::temp_dir().join("ret2shell");
    tokio::fs::create_dir_all(&tmp_dir).await?;
    let authfile = tmp_dir.join(format!(
      "skopeo-auth-{}-{}",
      std::process::id(),
      chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let guard = AuthfileGuard(authfile.clone());
    tokio::fs::write(&authfile, build_authfile(source, destination)).await?;
    let args = copy_image_args(&authfile, source, destination, repository, tag);
    let output = Command::new("skopeo").args(&args).output().await?;
    if !output.status.success() {
      let error = String::from_utf8_lossy(&output.stderr).to_string();
      warn!(?error, repository, tag, "copy image failed");
      return Err(ClusterError::UploadFailed(error));
    }
    info!(repository, tag, "copied image between registries");
    drop(guard);
    Ok(())
  }
}

/// Pure argument builder of [`Registry::copy_image`], kept separate so tests
/// can prove that credentials never appear in the skopeo argv.
fn copy_image_args(
  authfile: &std::path::Path, source: &RegistryConfig, destination: &RegistryConfig,
  repository: &str, tag: &str,
) -> Vec<String> {
  let mut args = vec![
    "copy".to_owned(),
    "--all".to_owned(),
    "--authfile".to_owned(),
    authfile.to_string_lossy().to_string(),
    format!("docker://{}/{repository}:{tag}", source.server),
    format!("docker://{}/{repository}:{tag}", destination.server),
  ];
  if source.insecure {
    args.push("--src-tls-verify=false".to_owned());
  }
  if destination.insecure {
    args.push("--dest-tls-verify=false".to_owned());
  }
  args
}

/// Removes the temporary skopeo authfile on every exit path.
struct AuthfileGuard(std::path::PathBuf);

impl Drop for AuthfileGuard {
  fn drop(&mut self) {
    std::fs::remove_file(&self.0).ok();
  }
}

/// Minimal standard-base64 encoder (with padding); the cluster crate has no
/// base64 dependency and cannot grow one.
fn base64(input: &[u8]) -> String {
  const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
  for chunk in input.chunks(3) {
    let bytes = [
      chunk[0],
      chunk.get(1).copied().unwrap_or(0),
      chunk.get(2).copied().unwrap_or(0),
    ];
    let index = ((bytes[0] as u32) << 16) | ((bytes[1] as u32) << 8) | bytes[2] as u32;
    out.push(ALPHABET[(index >> 18) as usize & 0x3F] as char);
    out.push(ALPHABET[(index >> 12) as usize & 0x3F] as char);
    out.push(if chunk.len() > 1 {
      ALPHABET[(index >> 6) as usize & 0x3F] as char
    } else {
      '='
    });
    out.push(if chunk.len() > 2 {
      ALPHABET[index as usize & 0x3F] as char
    } else {
      '='
    });
  }
  out
}

/// Builds a docker-style authfile covering both registries of a copy. Only
/// hosts with credentials get an entry, so public registries stay anonymous.
fn build_authfile(source: &RegistryConfig, destination: &RegistryConfig) -> String {
  #[derive(Serialize)]
  struct AuthEntry {
    auth: String,
  }
  let mut auths = serde_json::Map::new();
  for config in [source, destination] {
    if let Some((username, password)) = config.basic_auth() {
      let auth = base64(format!("{username}:{password}").as_bytes());
      auths.insert(
        config.server.clone(),
        serde_json::to_value(AuthEntry { auth }).expect("serializable auth entry"),
      );
    }
  }
  serde_json::json!({ "auths": auths }).to_string()
}

fn to_image_name(file: &str) -> String {
  let file = deunicode_with_tofu(file, "_").trim().to_owned();
  let escape_filesystem = Regex::new(r#"[\\\/:\*\?\"<>\|\ ]"#).unwrap();
  let escape_printable = Regex::new(r#"[^[:print:]]"#).unwrap();
  let file = escape_filesystem.replace_all(&file, "_").to_string();
  escape_printable
    .replace_all(&file, "")
    .to_string()
    .to_lowercase()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn config(username: Option<&str>, password: Option<&str>) -> RegistryConfig {
    RegistryConfig {
      username: username.map(str::to_owned),
      password: password.map(str::to_owned),
      server: "registry.example.com".to_owned(),
      insecure: true,
      external: "registry.example.com".to_owned(),
      enabled: Some(true),
    }
  }

  fn authorization(config: RegistryConfig) -> Option<String> {
    let request = Registry::new(config)
      .authenticate(reqwest::Client::new().get("http://registry.example.com/v2/_catalog"))
      .build()
      .unwrap();
    request
      .headers()
      .get(reqwest::header::AUTHORIZATION)
      .and_then(|value| value.to_str().ok())
      .map(str::to_owned)
  }

  #[test]
  fn catalog_requests_include_basic_auth() {
    assert_eq!(
      authorization(config(Some("ci"), Some("secret"))).as_deref(),
      Some("Basic Y2k6c2VjcmV0")
    );
  }

  #[test]
  fn catalog_requests_stay_anonymous_without_credentials() {
    assert_eq!(authorization(config(None, None)), None);
  }

  #[test]
  fn base64_matches_the_standard_alphabet() {
    assert_eq!(base64(b""), "");
    assert_eq!(base64(b"f"), "Zg==");
    assert_eq!(base64(b"fo"), "Zm8=");
    assert_eq!(base64(b"foo"), "Zm9v");
    assert_eq!(base64(b"foob"), "Zm9vYg==");
    assert_eq!(base64(b"fooba"), "Zm9vYmE=");
    assert_eq!(base64(b"foobar"), "Zm9vYmFy");
  }

  #[test]
  fn authfile_covers_both_registries_without_leaking_into_argv() {
    let source = RegistryConfig {
      username: Some("src-user".to_owned()),
      password: Some("src-secret".to_owned()),
      server: "src.example.com".to_owned(),
      insecure: true,
      external: "src.example.com".to_owned(),
      enabled: Some(true),
    };
    let destination = RegistryConfig {
      username: None,
      password: None,
      server: "dst.example.com".to_owned(),
      insecure: false,
      external: "dst.example.com".to_owned(),
      enabled: Some(true),
    };
    let authfile = build_authfile(&source, &destination);
    let parsed: serde_json::Value = serde_json::from_str(&authfile).unwrap();
    let auths = parsed.get("auths").unwrap().as_object().unwrap();
    // the authenticated source host carries a basic auth entry
    assert_eq!(
      auths
        .get("src.example.com")
        .unwrap()
        .get("auth")
        .unwrap()
        .as_str()
        .unwrap(),
      base64(b"src-user:src-secret")
    );
    // the anonymous destination host stays out of the authfile
    assert!(auths.get("dst.example.com").is_none());
  }

  #[test]
  fn skopeo_argv_never_contains_registry_credentials() {
    let source = RegistryConfig {
      username: Some("src-user".to_owned()),
      password: Some("src-secret".to_owned()),
      server: "src.example.com".to_owned(),
      insecure: true,
      external: "src.example.com".to_owned(),
      enabled: Some(true),
    };
    let destination = RegistryConfig {
      username: Some("dst-user".to_owned()),
      password: Some("dst-secret".to_owned()),
      server: "dst.example.com".to_owned(),
      insecure: false,
      external: "dst.example.com".to_owned(),
      enabled: Some(true),
    };
    let args = copy_image_args(
      std::path::Path::new("/tmp/skopeo-auth-1"),
      &source,
      &destination,
      "bucket_9f2c/nginx",
      "1731398400",
    );
    let joined = args.join(" ");
    assert!(joined.contains("copy --all --authfile"));
    assert!(joined.contains("docker://src.example.com/bucket_9f2c/nginx:1731398400"));
    assert!(joined.contains("docker://dst.example.com/bucket_9f2c/nginx:1731398400"));
    assert!(joined.contains("--src-tls-verify=false"));
    assert!(!joined.contains("--dest-tls-verify=false"));
    assert!(!joined.contains("src-secret"));
    assert!(!joined.contains("dst-secret"));
    assert!(!joined.contains("src-user"));
    assert!(!joined.contains("dst-user"));
  }
}

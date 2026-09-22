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
  fn to_image_name_normalizes_case_separators_and_non_printables() {
    assert_eq!(to_image_name("Hello World"), "hello_world");
    assert_eq!(to_image_name("pwn:challenge?"), "pwn_challenge_");
    assert_eq!(to_image_name("a/b\\c|d<e>f\"g*h"), "a_b_c_d_e_f_g_h");
    // tab is not printable and not in the filesystem escape set, so it is dropped.
    assert_eq!(to_image_name("ab\tcd"), "abcd");
  }

  #[test]
  fn base_builds_credential_prefix_only_when_both_parts_exist() {
    assert_eq!(
      Registry::new(config(Some("ci"), Some("secret")))
        .base()
        .unwrap(),
      "ci:secret@registry.example.com"
    );
    assert_eq!(
      Registry::new(config(None, None)).base().unwrap(),
      "registry.example.com"
    );
    let err = Registry::new(config(Some("ci"), None)).base().unwrap_err();
    assert!(matches!(err, ClusterError::MissingField(field) if field == "password"));
  }

  #[test]
  fn api_base_switches_scheme_on_insecure_flag() {
    assert_eq!(
      Registry::new(config(None, None)).api_base().unwrap(),
      "http://registry.example.com/v2"
    );
    let mut secure = config(None, None);
    secure.insecure = false;
    assert_eq!(
      Registry::new(secure).api_base().unwrap(),
      "https://registry.example.com/v2"
    );
  }

  #[tokio::test]
  async fn upload_image_rejects_unsupported_archives_before_any_io() {
    let err = Registry::new(config(None, None))
      .upload_image("org", "image.zip", tokio::io::empty())
      .await
      .unwrap_err();

    assert!(matches!(err, ClusterError::InvalidImageFileType(_)));
  }
}

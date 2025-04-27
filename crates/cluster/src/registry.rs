use std::collections::HashMap;

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

  pub async fn sync_repo(&mut self) -> Result<HashMap<String, Vec<String>>, ClusterError> {
    let api_base = self.api_base()?;
    let mut result: Vec<String> = Vec::new();
    let mut last = String::new();
    let mut orgs: HashMap<String, Vec<String>> = HashMap::new();
    loop {
      let res = match last {
        ref s if s.is_empty() => reqwest::get(&format!("{}/_catalog?n=1000", api_base)).await?,
        ref s => reqwest::get(&format!("{}/_catalog?n=1000&last={}", api_base, s)).await?,
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
    let res = reqwest::get(&format!("{api_base}/{repository}/tags/list")).await?;
    let body: Tags = res.json().await?;
    Ok(body.tags)
  }

  pub async fn upload_image(
    &self, org: &str, name: &str, mut stdin: impl AsyncRead + Send + Unpin,
  ) -> Result<(), ClusterError> {
    if !(name.ends_with(".tar") || name.ends_with(".tar.gz") || name.ends_with(".tgz")) {
      return Err(ClusterError::InvalidImageFileType(
        "only support tar/tar.gz/tgz files".to_string(),
      ));
    }
    let tmp_dir = std::env::temp_dir().join("ret2shell");
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
    debug!("uploading file to path: {:?}", file_path);
    tokio::io::copy(&mut stdin, &mut file).await?;
    // get tag name without file extension
    let repo = to_image_name(name.split('.').next().unwrap());
    let mut args = vec![
      "copy".to_string(),
      format!("docker-archive:{}", name),
      format!("docker://{}/{org}/{repo}:latest", self.base()?),
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
      info!("upload image {} to {}/{}", name, org, repo);
      Ok(())
    } else {
      let error = String::from_utf8_lossy(&output.stderr).to_string();
      warn!("upload image failed: {error}",);
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

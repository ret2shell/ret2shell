use std::collections::{BTreeSet, HashMap};

use deunicode::deunicode_with_tofu;
use r2s_config::cluster::RegistryConfig;
use regex::Regex;
use reqwest::{Method, StatusCode, header::HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

enum ManifestTask {
  Mirror {
    reference: String,
    destination_reference: Option<String>,
  },
  Put {
    digest: String,
    destination_reference: Option<String>,
    content_type: String,
    body: Vec<u8>,
  },
}

struct SyncRegistryImageSource<'a> {
  sync_base_url: &'a str,
  sync_token: Option<&'a str>,
  game_key: &'a str,
  release_id: &'a str,
  source_repository: &'a str,
}

pub struct SyncImageMirrorRequest<'a> {
  pub sync_base_url: &'a str,
  pub sync_token: Option<&'a str>,
  pub game_key: &'a str,
  pub release_id: &'a str,
  pub source_repository: &'a str,
  pub source_digest: &'a str,
  pub destination_repository: &'a str,
  pub destination_reference: &'a str,
}

const MANIFEST_ACCEPT: &str = "application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json";

impl Registry {
  pub fn new(c: RegistryConfig) -> Self {
    Self {
      credentials: Some(c),
    }
  }

  pub fn external(&self) -> Option<&str> {
    self
      .credentials
      .as_ref()
      .map(|credentials| credentials.external.as_str())
      .map(str::trim)
      .filter(|external| !external.is_empty())
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

  fn client(&self) -> reqwest::Client {
    reqwest::Client::new()
  }

  fn apply_registry_auth(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    let Some(credentials) = self.credentials.as_ref() else {
      return request;
    };
    match (&credentials.username, &credentials.password) {
      (Some(username), Some(password)) => request.basic_auth(username, Some(password)),
      _ => request,
    }
  }

  pub async fn inspect_image_digest(
    &self, repository: &str, reference: &str,
  ) -> Result<String, ClusterError> {
    let url = format!(
      "{}/{}/manifests/{}",
      self.api_base()?,
      repository.trim_matches('/'),
      reference
    );
    let response = self
      .apply_registry_auth(
        self
          .client()
          .request(Method::GET, url)
          .header("Accept", MANIFEST_ACCEPT),
      )
      .send()
      .await?;
    if !response.status().is_success() {
      return Err(ClusterError::RegistrySyncFailed(format!(
        "failed to inspect image digest: {}",
        response.status()
      )));
    }
    response
      .headers()
      .get("docker-content-digest")
      .and_then(|value| value.to_str().ok())
      .map(str::to_owned)
      .ok_or_else(|| {
        ClusterError::RegistryDigestMissing(format!(
          "{repository}:{reference} does not have docker-content-digest header"
        ))
      })
  }

  pub async fn mirror_sync_image(
    &self, request: SyncImageMirrorRequest<'_>,
  ) -> Result<(), ClusterError> {
    let source = SyncRegistryImageSource {
      sync_base_url: request.sync_base_url,
      sync_token: request.sync_token,
      game_key: request.game_key,
      release_id: request.release_id,
      source_repository: request.source_repository,
    };
    let client = self.client();
    let mut mirrored_manifests = BTreeSet::new();
    let mut mirrored_blobs = BTreeSet::new();
    let mut stack = vec![ManifestTask::Mirror {
      reference: request.source_digest.to_owned(),
      destination_reference: Some(request.destination_reference.to_owned()),
    }];
    while let Some(task) = stack.pop() {
      match task {
        ManifestTask::Mirror {
          reference,
          destination_reference,
        } => {
          let (content_type, manifest_body, manifest_digest) = self
            .fetch_remote_manifest(&client, &source, &reference)
            .await?;
          if mirrored_manifests.contains(&manifest_digest) {
            if let Some(destination_reference) = destination_reference {
              self
                .put_manifest(
                  request.destination_repository,
                  &destination_reference,
                  &content_type,
                  manifest_body,
                )
                .await?;
            }
            continue;
          }
          mirrored_manifests.insert(manifest_digest.clone());
          let manifest_json: Value = serde_json::from_slice(&manifest_body)?;
          stack.push(ManifestTask::Put {
            digest: manifest_digest.clone(),
            destination_reference,
            content_type,
            body: manifest_body,
          });
          for child in manifest_child_digests(&manifest_json).into_iter().rev() {
            stack.push(ManifestTask::Mirror {
              reference: child.clone(),
              destination_reference: Some(child),
            });
          }
          for blob in manifest_blob_digests(&manifest_json) {
            self
              .copy_blob(
                &client,
                &source,
                &blob,
                request.destination_repository,
                &mut mirrored_blobs,
              )
              .await?;
          }
        }
        ManifestTask::Put {
          digest,
          destination_reference,
          content_type,
          body,
        } => {
          self
            .put_manifest(
              request.destination_repository,
              &digest,
              &content_type,
              body.clone(),
            )
            .await?;
          if let Some(destination_reference) = destination_reference
            && destination_reference != digest
          {
            self
              .put_manifest(
                request.destination_repository,
                &destination_reference,
                &content_type,
                body,
              )
              .await?;
          }
        }
      }
    }
    Ok(())
  }

  pub async fn sync_repo(&mut self) -> Result<HashMap<String, Vec<String>>, ClusterError> {
    let api_base = self.api_base()?;
    let mut result: Vec<String> = Vec::new();
    let mut last = String::new();
    let mut orgs: HashMap<String, Vec<String>> = HashMap::new();
    loop {
      let res = match last {
        ref s if s.is_empty() => reqwest::get(&format!("{api_base}/_catalog?n=1000")).await?,
        ref s => reqwest::get(&format!("{api_base}/_catalog?n=1000&last={s}")).await?,
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
      info!(?name, ?org, ?repo, "uploaded image");
      Ok(())
    } else {
      let error = String::from_utf8_lossy(&output.stderr).to_string();
      warn!(?error, "upload image failed");
      Err(ClusterError::UploadFailed(error))
    }
  }

  async fn copy_blob(
    &self, client: &reqwest::Client, source: &SyncRegistryImageSource<'_>, digest: &str,
    destination_repository: &str, mirrored_blobs: &mut BTreeSet<String>,
  ) -> Result<(), ClusterError> {
    if mirrored_blobs.contains(digest) || self.blob_exists(destination_repository, digest).await? {
      mirrored_blobs.insert(digest.to_owned());
      return Ok(());
    }

    let response = self.fetch_remote_blob(client, source, digest).await?;
    let blob = response.bytes().await?;
    let upload_location = self.start_blob_upload(destination_repository).await?;
    let patch_response = self
      .apply_registry_auth(
        client
          .request(Method::PATCH, &upload_location)
          .header("Content-Type", "application/octet-stream")
          .body(blob),
      )
      .send()
      .await?;
    if !patch_response.status().is_success() {
      return Err(ClusterError::RegistrySyncFailed(format!(
        "failed to upload blob patch for {digest}: {}",
        patch_response.status()
      )));
    }
    let finalize_location = patch_response
      .headers()
      .get("location")
      .and_then(|value| value.to_str().ok())
      .map(|value| resolve_registry_location(&upload_location, value))
      .unwrap_or(upload_location);
    let finalize_response = self
      .apply_registry_auth(
        client
          .request(Method::PUT, format!("{finalize_location}?digest={digest}"))
          .body(reqwest::Body::from(Vec::<u8>::new())),
      )
      .send()
      .await?;
    if !matches!(
      finalize_response.status(),
      StatusCode::CREATED | StatusCode::OK
    ) {
      return Err(ClusterError::RegistrySyncFailed(format!(
        "failed to finalize blob {digest}: {}",
        finalize_response.status()
      )));
    }
    mirrored_blobs.insert(digest.to_owned());
    Ok(())
  }

  async fn fetch_remote_manifest(
    &self, client: &reqwest::Client, source: &SyncRegistryImageSource<'_>, reference: &str,
  ) -> Result<(String, Vec<u8>, String), ClusterError> {
    let mut request = client
      .request(
        Method::GET,
        format!(
          "{}/api/sync/v1/games/{}/releases/{}/registry/v2/{}/manifests/{}",
          source.sync_base_url.trim_end_matches('/'),
          source.game_key,
          source.release_id,
          source.source_repository.trim_matches('/'),
          reference
        ),
      )
      .header("Accept", MANIFEST_ACCEPT);
    if let Some(sync_token) = source.sync_token {
      request = request.bearer_auth(sync_token);
    }
    let response = request.send().await?;
    if !response.status().is_success() {
      return Err(ClusterError::RegistrySyncFailed(format!(
        "failed to fetch remote manifest {source_repository}@{reference}: {}",
        response.status(),
        source_repository = source.source_repository
      )));
    }
    let content_type = response
      .headers()
      .get("content-type")
      .and_then(|value| value.to_str().ok())
      .unwrap_or("application/vnd.oci.image.manifest.v1+json")
      .to_owned();
    let digest = response
      .headers()
      .get("docker-content-digest")
      .and_then(|value| value.to_str().ok())
      .map(str::to_owned)
      .unwrap_or_else(|| reference.to_owned());
    let body = response.bytes().await?.to_vec();
    Ok((content_type, body, digest))
  }

  async fn fetch_remote_blob(
    &self, client: &reqwest::Client, source: &SyncRegistryImageSource<'_>, digest: &str,
  ) -> Result<reqwest::Response, ClusterError> {
    let mut request = client.request(
      Method::GET,
      format!(
        "{}/api/sync/v1/games/{}/releases/{}/registry/v2/{}/blobs/{}",
        source.sync_base_url.trim_end_matches('/'),
        source.game_key,
        source.release_id,
        source.source_repository.trim_matches('/'),
        digest
      ),
    );
    if let Some(sync_token) = source.sync_token {
      request = request.bearer_auth(sync_token);
    }
    let response = request.send().await?;
    if !response.status().is_success() {
      return Err(ClusterError::RegistrySyncFailed(format!(
        "failed to fetch remote blob {digest}: {}",
        response.status()
      )));
    }
    Ok(response)
  }

  async fn blob_exists(&self, repository: &str, digest: &str) -> Result<bool, ClusterError> {
    let response = self
      .apply_registry_auth(self.client().request(
        Method::HEAD,
        format!(
          "{}/{}/blobs/{}",
          self.api_base()?,
          repository.trim_matches('/'),
          digest
        ),
      ))
      .send()
      .await?;
    Ok(matches!(response.status(), StatusCode::OK))
  }

  async fn start_blob_upload(&self, repository: &str) -> Result<String, ClusterError> {
    let response = self
      .apply_registry_auth(self.client().request(
        Method::POST,
        format!(
          "{}/{}/blobs/uploads/",
          self.api_base()?,
          repository.trim_matches('/')
        ),
      ))
      .send()
      .await?;
    if !matches!(
      response.status(),
      StatusCode::ACCEPTED | StatusCode::CREATED
    ) {
      return Err(ClusterError::RegistrySyncFailed(format!(
        "failed to start blob upload: {}",
        response.status()
      )));
    }
    response
      .headers()
      .get("location")
      .and_then(|value| value.to_str().ok())
      .map(|value| resolve_registry_location(&self.api_base().unwrap_or_default(), value))
      .ok_or_else(|| {
        ClusterError::RegistrySyncFailed("blob upload did not return a location header".to_owned())
      })
  }

  async fn put_manifest(
    &self, repository: &str, reference: &str, content_type: &str, body: Vec<u8>,
  ) -> Result<(), ClusterError> {
    let response = self
      .apply_registry_auth(
        self
          .client()
          .request(
            Method::PUT,
            format!(
              "{}/{}/manifests/{}",
              self.api_base()?,
              repository.trim_matches('/'),
              reference
            ),
          )
          .header(
            "Content-Type",
            HeaderValue::from_str(content_type).unwrap_or(HeaderValue::from_static(
              "application/vnd.oci.image.manifest.v1+json",
            )),
          )
          .body(body),
      )
      .send()
      .await?;
    if !matches!(response.status(), StatusCode::CREATED | StatusCode::OK) {
      return Err(ClusterError::RegistrySyncFailed(format!(
        "failed to push manifest {repository}:{reference}: {}",
        response.status()
      )));
    }
    Ok(())
  }
}

fn resolve_registry_location(base: &str, location: &str) -> String {
  if location.starts_with("http://") || location.starts_with("https://") {
    return location.to_owned();
  }
  let (scheme_host, _) = base.split_once("/v2").unwrap_or((base, ""));
  if location.starts_with('/') {
    format!("{}{}", scheme_host.trim_end_matches('/'), location)
  } else {
    format!("{}/{}", scheme_host.trim_end_matches('/'), location)
  }
}

fn manifest_child_digests(manifest: &Value) -> Vec<String> {
  manifest
    .get("manifests")
    .and_then(Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(|entry| {
      entry
        .get("digest")
        .and_then(Value::as_str)
        .map(str::to_owned)
    })
    .collect()
}

fn manifest_blob_digests(manifest: &Value) -> Vec<String> {
  let mut digests = Vec::new();
  if let Some(digest) = manifest
    .get("config")
    .and_then(|config| config.get("digest"))
    .and_then(Value::as_str)
  {
    digests.push(digest.to_owned());
  }
  if let Some(layers) = manifest.get("layers").and_then(Value::as_array) {
    digests.extend(layers.iter().filter_map(|layer| {
      layer
        .get("digest")
        .and_then(Value::as_str)
        .map(str::to_owned)
    }));
  }
  digests
}

#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{manifest_blob_digests, manifest_child_digests, resolve_registry_location};

  #[test]
  fn resolve_registry_location_handles_relative_and_absolute_paths() {
    assert_eq!(
      resolve_registry_location(
        "https://registry.example.com/v2",
        "/v2/repo/blobs/uploads/123"
      ),
      "https://registry.example.com/v2/repo/blobs/uploads/123"
    );
    assert_eq!(
      resolve_registry_location(
        "https://registry.example.com/v2",
        "https://registry.example.com/v2/repo/blobs/uploads/456"
      ),
      "https://registry.example.com/v2/repo/blobs/uploads/456"
    );
  }

  #[test]
  fn manifest_digest_helpers_collect_expected_entries() {
    let manifest = json!({
      "config": { "digest": "sha256:config" },
      "layers": [
        { "digest": "sha256:layer1" },
        { "digest": "sha256:layer2" }
      ],
      "manifests": [
        { "digest": "sha256:child1" },
        { "digest": "sha256:child2" }
      ]
    });

    assert_eq!(
      manifest_blob_digests(&manifest),
      vec![
        "sha256:config".to_owned(),
        "sha256:layer1".to_owned(),
        "sha256:layer2".to_owned()
      ]
    );
    assert_eq!(
      manifest_child_digests(&manifest),
      vec!["sha256:child1".to_owned(), "sha256:child2".to_owned()]
    );
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

use std::{net::IpAddr, process::Stdio, str::FromStr};

use r2s_bucket::{validate_bucket_id, validate_commit_hash};
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use url::Url;

use crate::traits::ResponseError;

/// Normalizes a source instance endpoint (scheme + host + optional api base
/// path, e.g. `https://ctf.example.org/api`). The endpoint is only a network
/// locator; the sync identity comes from the discovered bucket id.
pub(crate) fn normalize_endpoint(input: &str) -> Result<Url, ResponseError> {
  if input.len() > 2048 {
    return Err(ResponseError::BadRequest(
      "source endpoint is too long".to_owned(),
    ));
  }
  let url = Url::parse(input)
    .map_err(|_| ResponseError::BadRequest("invalid source endpoint".to_owned()))?;
  let host = url
    .host_str()
    .ok_or_else(|| ResponseError::BadRequest("source endpoint has no host".to_owned()))?
    .to_owned();
  if !url.username().is_empty() || url.password().is_some() {
    return Err(ResponseError::BadRequest(
      "source endpoint must not contain user information".to_owned(),
    ));
  }
  if url.query().is_some() || url.fragment().is_some() {
    return Err(ResponseError::BadRequest(
      "source endpoint must not contain a query or fragment".to_owned(),
    ));
  }
  let local_http = IpAddr::from_str(&host).is_ok_and(|ip| ip.is_loopback())
    || host == "localhost"
    || !host.contains('.');
  if url.scheme() != "https" && !(url.scheme() == "http" && local_http) {
    return Err(ResponseError::BadRequest(
      "source endpoint must use HTTPS, or HTTP only for a local instance".to_owned(),
    ));
  }
  let path = url.path().trim_end_matches('/');
  if !path.is_empty()
    && !path.split('/').skip(1).all(|segment| {
      !segment.is_empty()
        && segment
          .chars()
          .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    })
  {
    return Err(ResponseError::BadRequest(
      "source endpoint path must be plain api base segments".to_owned(),
    ));
  }
  Ok(url.clone())
}

/// Descriptor returned by the source instance `POST /sync/discover` endpoint.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct SourceDescriptor {
  pub(crate) bucket_id: String,
  pub(crate) head: String,
  pub(crate) name: String,
  // cached by the managed-distribution model once it lands
  #[allow(dead_code)]
  pub(crate) avatar: Option<String>,
  #[allow(dead_code)]
  pub(crate) description: String,
  #[allow(dead_code)]
  pub(crate) access_policy_sync: i32,
  pub(crate) repository_path: String,
}

/// A source pinned for one import or sync run: the descriptor plus the fully
/// resolved repository URL on the source instance.
#[derive(Clone, Debug)]
pub(crate) struct DiscoveredSource {
  pub(crate) descriptor: SourceDescriptor,
  pub(crate) repository_url: Url,
}

fn curl_config(url: &Url, token: &str) -> String {
  fn quote(value: &str) -> String {
    value
      .replace('\\', "\\\\")
      .replace('"', "\\\"")
      .replace('\n', "\\n")
      .replace('\r', "\\r")
  }
  let body = serde_json::json!({ "token": token });
  format!(
    "request = \"POST\"\nurl = \"{}\"\nheader = \"Content-Type: application/json\"\ndata = \"{}\"\n",
    quote(url.as_str()),
    quote(&body.to_string())
  )
}

fn validate_repository_url(url: &Url) -> Result<(), String> {
  // the scheme and host are inherited from the already validated endpoint, so
  // only the descriptor-controlled path shape needs checking here
  let path = url.path().trim_end_matches('/');
  if !path.ends_with(".git") || !path.contains("/game/") || !path.contains("/repo/") {
    return Err(format!(
      "discovered repository URL is not a ret2shell game Git endpoint: {path}"
    ));
  }
  Ok(())
}

fn resolve(descriptor: &SourceDescriptor, endpoint: &Url) -> Result<Url, String> {
  validate_bucket_id(&descriptor.bucket_id).map_err(|error| error.to_string())?;
  if !validate_commit_hash(&descriptor.head) {
    return Err(format!(
      "discovered head is not a full commit hash: {}",
      descriptor.head
    ));
  }
  let path = &descriptor.repository_path;
  if !path.starts_with('/') || path.contains("..") || path.contains('\\') {
    return Err(format!("discovered repository path is not safe: {path}"));
  }
  let repository_url = endpoint
    .join(path)
    .map_err(|error| format!("failed to resolve the repository URL: {error}"))?;
  validate_repository_url(&repository_url)?;
  Ok(repository_url)
}

/// Discovers the source bucket id and the current admission HEAD from the
/// source instance. The token is sent in the JSON request body through the
/// curl stdin config, so it never appears in argv, URLs, or logs.
pub(crate) async fn discover(endpoint: &Url, token: &str) -> Result<DiscoveredSource, String> {
  let mut discover_url = endpoint.clone();
  discover_url.set_path(&format!(
    "{}/sync/discover",
    endpoint.path().trim_end_matches('/')
  ));
  let mut command = tokio::process::Command::new("curl");
  command
    .kill_on_drop(true)
    .arg("--fail")
    .arg("--silent")
    .arg("--show-error")
    .arg("--max-time")
    .arg("30")
    .arg("--config")
    .arg("-")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  let mut child = command.spawn().map_err(|error| error.to_string())?;
  child
    .stdin
    .take()
    .ok_or_else(|| "failed to open curl configuration input".to_owned())?
    .write_all(curl_config(&discover_url, token).as_bytes())
    .await
    .map_err(|error| error.to_string())?;
  let output = child
    .wait_with_output()
    .await
    .map_err(|error| error.to_string())?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).replace(token, "<redacted>");
    return Err(format!("source discovery failed: {}", stderr.trim()));
  }
  let descriptor: SourceDescriptor = serde_json::from_slice(&output.stdout)
    .map_err(|error| format!("source discovery returned an invalid descriptor: {error}"))?;
  let repository_url = resolve(&descriptor, endpoint)?;
  Ok(DiscoveredSource {
    descriptor,
    repository_url,
  })
}

#[cfg(test)]
mod tests {
  use super::{SourceDescriptor, curl_config, normalize_endpoint, resolve};

  fn descriptor(repository_path: &str) -> SourceDescriptor {
    SourceDescriptor {
      bucket_id: "upstream_bucket_9f2c".to_owned(),
      head: "0123456789abcdef0123456789abcdef01234567".to_owned(),
      name: "Upstream".to_owned(),
      avatar: None,
      description: "upstream game".to_owned(),
      access_policy_sync: 0,
      repository_path: repository_path.to_owned(),
    }
  }

  #[test]
  fn endpoint_accepts_https_and_local_http_bases() {
    assert!(normalize_endpoint("https://ctf.example.org/api").is_ok());
    assert!(normalize_endpoint("https://ctf.example.org").is_ok());
    assert!(normalize_endpoint("http://127.0.0.1:8080/api").is_ok());
    assert!(normalize_endpoint("http://platform-a/api/").is_ok());
    for rejected in [
      "file:///tmp",
      "http://ctf.example.org/api",
      "https://user:password@ctf.example.org/api",
      "https://ctf.example.org/api?token=secret",
      "https://ctf.example.org/api/game.git",
      "https://ctf.example.org/api/game/1/repo/x.git",
    ] {
      assert!(normalize_endpoint(rejected).is_err(), "accepted {rejected}");
    }
  }

  #[test]
  fn resolve_builds_a_repository_url_from_the_descriptor() {
    let endpoint = normalize_endpoint("https://ctf.example.org/api").unwrap();
    let discovered = resolve(
      &descriptor("/api/game/3/repo/upstream_bucket_9f2c.git"),
      &endpoint,
    );
    assert_eq!(
      discovered.unwrap().as_str(),
      "https://ctf.example.org/api/game/3/repo/upstream_bucket_9f2c.git"
    );
  }

  #[test]
  fn resolve_rejects_unsafe_or_malformed_descriptors() {
    let endpoint = normalize_endpoint("https://ctf.example.org/api").unwrap();
    // traversal in the repository path
    assert!(resolve(&descriptor("/api/../secrets"), &endpoint).is_err());
    // not a game repository endpoint
    assert!(resolve(&descriptor("/api/user/3"), &endpoint).is_err());
    // relative path
    assert!(resolve(&descriptor("api/game/3/repo/x.git"), &endpoint).is_err());
    let mut bad_head = descriptor("/api/game/3/repo/upstream_bucket_9f2c.git");
    bad_head.head = "main".to_owned();
    assert!(resolve(&bad_head, &endpoint).is_err());
    let mut bad_bucket = descriptor("/api/game/3/repo/upstream_bucket_9f2c.git");
    bad_bucket.bucket_id = "../escape".to_owned();
    assert!(resolve(&bad_bucket, &endpoint).is_err());
  }

  #[test]
  fn curl_config_keeps_the_token_out_of_argv() {
    let url = normalize_endpoint("https://ctf.example.org/api").unwrap();
    let config = curl_config(&url, "bad\"token");
    assert!(config.contains("request = \"POST\""));
    assert!(config.contains("Content-Type: application/json"));
    // the JSON body escapes the quote once, the curl config escapes both the
    // quote and the JSON backslash again for the config file format
    assert!(config.contains(r#"bad\\\"token"#));
    assert!(!config.contains("\"token\":\"bad\"token\""));
  }
}

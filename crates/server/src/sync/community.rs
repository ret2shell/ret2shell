use std::{collections::BTreeMap, net::IpAddr, process::Stdio, str::FromStr};

use r2s_bucket::{validate_bucket_id, validate_commit_hash};
use serde::{Deserialize, Serialize};
use tracing::warn;
use url::Url;

use crate::traits::ResponseError;

/// Upper bound of the community registry index document.
const MAX_INDEX_BYTES: usize = 1024 * 1024;

/// Normalizes a community registry index URL. The index is typically a plain
/// JSON document on a public host (any path shape is allowed); only the
/// transport safety rules of the instance sync apply.
pub(crate) fn normalize_registry_url(input: &str) -> Result<Url, ResponseError> {
  if input.len() > 2048 {
    return Err(ResponseError::BadRequest(
      "registry index URL is too long".to_owned(),
    ));
  }
  let url = Url::parse(input)
    .map_err(|_| ResponseError::BadRequest("invalid registry index URL".to_owned()))?;
  let host = url
    .host_str()
    .ok_or_else(|| ResponseError::BadRequest("registry index URL has no host".to_owned()))?
    .to_owned();
  if !url.username().is_empty() || url.password().is_some() {
    return Err(ResponseError::BadRequest(
      "registry index URL must not contain user information".to_owned(),
    ));
  }
  if url.fragment().is_some() {
    return Err(ResponseError::BadRequest(
      "registry index URL must not contain a fragment".to_owned(),
    ));
  }
  let local_http = IpAddr::from_str(&host).is_ok_and(|ip| ip.is_loopback())
    || host == "localhost"
    || !host.contains('.');
  if url.scheme() != "https" && !(url.scheme() == "http" && local_http) {
    return Err(ResponseError::BadRequest(
      "registry index URL must use HTTPS, or HTTP only for a local instance".to_owned(),
    ));
  }
  Ok(url)
}

/// One entry of the community registry index, keyed by the source bucket id.
/// `bucket_id` and `head_ref` are protocol fields: the admission anchor and
/// the approved version, not display-only metadata.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct RegistryEntry {
  pub(crate) name: String,
  #[serde(default)]
  pub(crate) avatar: Option<String>,
  #[serde(default)]
  pub(crate) description: Option<String>,
  pub(crate) endpoint: String,
  #[serde(default)]
  pub(crate) token: String,
  pub(crate) head_ref: String,
}

impl RegistryEntry {
  /// A syntactically usable entry: a full admission commit, a normalizable
  /// endpoint and, when a credential is required, a non-empty token. Entries
  /// without a token are listed but cannot be imported.
  fn validate(&self) -> Result<(), String> {
    if !validate_commit_hash(&self.head_ref) {
      return Err(format!(
        "head_ref is not a full commit hash: {}",
        self.head_ref
      ));
    }
    if self.name.trim().is_empty() {
      return Err("name must not be empty".to_owned());
    }
    if super::discover::normalize_endpoint(&self.endpoint).is_err() {
      return Err(format!(
        "endpoint is not a valid source endpoint: {}",
        self.endpoint
      ));
    }
    Ok(())
  }
}

/// Sanitized registry entry for API responses: the token never leaves the
/// server, only whether one is stored.
#[derive(Serialize)]
pub(crate) struct PublicRegistryEntry {
  pub(crate) bucket_id: String,
  pub(crate) name: String,
  pub(crate) avatar: Option<String>,
  pub(crate) description: Option<String>,
  pub(crate) endpoint: String,
  pub(crate) head_ref: String,
  pub(crate) has_token: bool,
}

/// Fetches and validates the community registry index. The index is fetched
/// server-side through curl so entry tokens never transit the browser.
pub(crate) async fn fetch_registry_index(
  url: &Url,
) -> Result<BTreeMap<String, RegistryEntry>, String> {
  let output = tokio::process::Command::new("curl")
    .kill_on_drop(true)
    .arg("--fail")
    .arg("--silent")
    .arg("--show-error")
    .arg("--max-time")
    .arg("30")
    .arg("--max-filesize")
    .arg(MAX_INDEX_BYTES.to_string())
    .arg(url.as_str())
    .stdin(Stdio::null())
    .output()
    .await
    .map_err(|error| format!("failed to run curl: {error}"))?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!(
      "failed to fetch the registry index: {}",
      stderr.trim()
    ));
  }
  if output.stdout.len() > MAX_INDEX_BYTES {
    return Err("the registry index exceeds the size limit".to_owned());
  }
  let raw: BTreeMap<String, RegistryEntry> = serde_json::from_slice(&output.stdout)
    .map_err(|error| format!("the registry index is not valid JSON: {error}"))?;
  let mut entries = BTreeMap::new();
  for (bucket_id, entry) in raw {
    if let Err(error) = validate_bucket_id(&bucket_id) {
      warn!(bucket_id, error=%error, "skipping registry entry with an invalid bucket id");
      continue;
    }
    if let Err(error) = entry.validate() {
      warn!(bucket_id, error=%error, "skipping invalid registry entry");
      continue;
    }
    entries.insert(bucket_id, entry);
  }
  Ok(entries)
}

/// Sanitized listing for the community mode UI.
pub(crate) async fn list_entries(url: &Url) -> Result<Vec<PublicRegistryEntry>, String> {
  let index = fetch_registry_index(url).await?;
  Ok(
    index
      .into_iter()
      .map(|(bucket_id, entry)| PublicRegistryEntry {
        bucket_id,
        has_token: !entry.token.is_empty(),
        name: entry.name,
        avatar: entry.avatar,
        description: entry.description,
        endpoint: entry.endpoint,
        head_ref: entry.head_ref,
      })
      .collect(),
  )
}

/// One validated entry by bucket id; the admission anchor of a community
/// import or incremental sync.
pub(crate) async fn get_entry(url: &Url, bucket_id: &str) -> Result<RegistryEntry, String> {
  let mut index = fetch_registry_index(url).await?;
  index.remove(bucket_id).ok_or_else(|| {
    format!(
      "the registry index has no entry for bucket id {bucket_id}; \
       the entry may have been removed, re-import or unbind the distribution"
    )
  })
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{RegistryEntry, normalize_registry_url};

  fn entry_json(head_ref: &str) -> serde_json::Value {
    json!({
      "name": "Upstream Game",
      "avatar": "https://ctf.example.org/logo.png",
      "description": "an upstream training game",
      "endpoint": "https://ctf.example.org/api",
      "token": "registry-token",
      "head_ref": head_ref,
    })
  }

  #[test]
  fn registry_urls_accept_public_https_and_local_http() {
    assert!(
      normalize_registry_url(
        "https://raw.githubusercontent.com/ret2shell/registry/main/index.json"
      )
      .is_ok()
    );
    assert!(normalize_registry_url("http://127.0.0.1:8080/registry/index.json").is_ok());
    for rejected in [
      "ftp://example.org/index.json",
      "http://example.org/index.json",
      "https://user:pass@example.org/index.json",
      "not a url",
    ] {
      assert!(
        normalize_registry_url(rejected).is_err(),
        "accepted {rejected}"
      );
    }
  }

  #[test]
  fn entries_validate_their_admission_anchor() {
    let valid: RegistryEntry =
      serde_json::from_value(entry_json("0123456789abcdef0123456789abcdef01234567")).unwrap();
    assert!(valid.validate().is_ok());
    // a token-less entry stays listable (has_token=false), just not importable
    let mut tokenless = valid.clone();
    tokenless.token = String::new();
    assert!(tokenless.validate().is_ok());
    // branch names are not admission anchors
    let mut bad_head = valid.clone();
    bad_head.head_ref = "main".to_owned();
    assert!(bad_head.validate().is_err());
    // a non-ret2shell endpoint is rejected
    let mut bad_endpoint = valid;
    bad_endpoint.endpoint = "https://user:pass@ctf.example.org".to_owned();
    assert!(bad_endpoint.validate().is_err());
  }
}

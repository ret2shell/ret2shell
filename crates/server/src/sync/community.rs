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
/// the approved version, not display-only metadata. `mirrors` are alternate
/// download addresses of the *same* distribution: they share the entry token
/// and must serve the same bucket id and head_ref — a mirror that serves
/// different content is rejected outright, never fallen through.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct RegistryEntry {
  pub(crate) name: String,
  #[serde(default)]
  pub(crate) avatar: Option<String>,
  #[serde(default)]
  pub(crate) description: Option<String>,
  pub(crate) endpoint: String,
  #[serde(default)]
  pub(crate) mirrors: Vec<String>,
  #[serde(default)]
  pub(crate) token: String,
  pub(crate) head_ref: String,
}

/// Upper bound on the mirror list per entry, bounding the candidate race.
pub(crate) const MAX_MIRRORS: usize = 5;

impl RegistryEntry {
  /// A syntactically usable entry: a full admission commit, a normalizable
  /// endpoint, at most a handful of equally normalizable mirrors and, when a
  /// credential is required, a non-empty token. Entries without a token are
  /// listed but cannot be imported.
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
    if self.mirrors.len() > MAX_MIRRORS {
      return Err(format!(
        "mirrors must hold at most {MAX_MIRRORS} entries, got {}",
        self.mirrors.len()
      ));
    }
    for mirror in &self.mirrors {
      if super::discover::normalize_endpoint(mirror).is_err() {
        return Err(format!(
          "mirror endpoint is not a valid source endpoint: {mirror}"
        ));
      }
    }
    Ok(())
  }

  /// Every download address of the entry: the primary endpoint first, then
  /// its mirrors. All candidates share the entry token.
  pub(crate) fn candidates(&self) -> Vec<String> {
    let mut candidates = Vec::with_capacity(1 + self.mirrors.len());
    candidates.push(self.endpoint.clone());
    candidates.extend(self.mirrors.iter().cloned());
    candidates
  }
}

/// Structured outcome of [`verify_entry_match`], so callers can map the two
/// violations onto their own error taxonomies.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum EntryMismatch {
  Bucket { found: String, expected: String },
  Head { found: String, expected: String },
}

impl std::fmt::Display for EntryMismatch {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Bucket { found, expected } => write!(
        formatter,
        "the source reports bucket id {found} but the registry entry is keyed {expected}"
      ),
      Self::Head { found, expected } => write!(
        formatter,
        "the source HEAD {found} does not match the registry-approved head_ref {expected}; \
         the registry must publish the new version first"
      ),
    }
  }
}

/// Cross-checks a discovered source against its registry entry. This is the
/// mirror admission rule: the winner of a candidate race must serve exactly
/// the keyed bucket id and the published head_ref. A mismatch is a
/// supply-chain violation and must abort the run — the next candidate is
/// never tried, because a wrong-but-fast mirror is worse than a slow one.
pub(crate) fn verify_entry_match(
  descriptor_bucket_id: &str, descriptor_head: &str, entry_bucket_id: &str, entry_head_ref: &str,
) -> Result<(), EntryMismatch> {
  if descriptor_bucket_id != entry_bucket_id {
    return Err(EntryMismatch::Bucket {
      found: descriptor_bucket_id.to_owned(),
      expected: entry_bucket_id.to_owned(),
    });
  }
  if !descriptor_head.eq_ignore_ascii_case(entry_head_ref) {
    return Err(EntryMismatch::Head {
      found: descriptor_head.to_owned(),
      expected: entry_head_ref.to_owned(),
    });
  }
  Ok(())
}

/// A boxed, sendable future yielding `T` — the unit of the candidate race.
type BoxedFuture<T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send>>;

/// Race core: polls the given futures concurrently and returns the first
/// successful one together with its index; futures that fail before a winner
/// emerges are collected (with their index) into the error list. When every
/// future fails the collected list is returned. Losers are dropped, which
/// relies on the discovery call being idempotent and on its curl child being
/// killed on drop. Each future carries its own original index because
/// `select_all` reports positions relative to the survivors of the current
/// round, not of the original list.
async fn first_ok<T: Send + 'static>(
  futures: Vec<BoxedFuture<Result<T, String>>>,
) -> (Option<(T, usize)>, Vec<(usize, String)>) {
  let mut futures: Vec<BoxedFuture<(usize, Result<T, String>)>> = futures
    .into_iter()
    .enumerate()
    .map(|(index, future)| Box::pin(async move { (index, future.await) }) as BoxedFuture<_>)
    .collect();
  let mut failures = Vec::new();
  loop {
    if futures.is_empty() {
      return (None, failures);
    }
    let ((original_index, outcome), _round_index, remaining) =
      futures::future::select_all(futures).await;
    futures = remaining;
    match outcome {
      Ok(value) => return (Some((value, original_index)), failures),
      Err(message) => failures.push((original_index, message)),
    }
  }
}

/// Speed-selects a download address: fires a discovery at every candidate
/// concurrently and takes the fastest responder. Every candidate shares the
/// entry token — mirrors serve the same distribution by definition. The
/// winner still has to pass [`verify_entry_match`]: winning the race only
/// grants the right to be checked.
pub(crate) async fn race_discover(
  candidates: &[String], token: &str,
) -> Result<(super::discover::DiscoveredSource, String, u128), Vec<String>> {
  let mut futures = Vec::with_capacity(candidates.len());
  for candidate in candidates {
    let endpoint = match super::discover::normalize_endpoint(candidate) {
      Ok(endpoint) => endpoint,
      Err(error) => {
        return Err(vec![format!(
          "candidate {candidate} is not a valid endpoint: {error}"
        )]);
      }
    };
    let token = token.to_owned();
    futures.push(
      Box::pin(async move { super::discover::discover(&endpoint, &token).await }) as BoxedFuture<_>,
    );
  }
  let started = std::time::Instant::now();
  let (winner, failures) = first_ok(futures).await;
  match winner {
    Some((discovered, index)) => Ok((
      discovered,
      candidates[index].clone(),
      started.elapsed().as_millis(),
    )),
    None => Err(
      failures
        .into_iter()
        .map(|(index, message)| format!("{} failed: {message}", candidates[index]))
        .collect(),
    ),
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
  /// Number of alternate download addresses published for this entry.
  pub(crate) mirror_count: usize,
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
        has_token: !entry.token.is_empty(),
        mirror_count: entry.mirrors.len(),
        bucket_id,
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

  use super::{MAX_MIRRORS, RegistryEntry, first_ok, normalize_registry_url, verify_entry_match};

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
    let mut bad_endpoint = valid.clone();
    bad_endpoint.endpoint = "https://user:pass@ctf.example.org".to_owned();
    assert!(bad_endpoint.validate().is_err());
  }

  #[test]
  fn mirror_lists_are_bounded_and_each_endpoint_validated() {
    let mut entry: RegistryEntry =
      serde_json::from_value(entry_json("0123456789abcdef0123456789abcdef01234567")).unwrap();
    // a couple of healthy mirrors pass and become candidates
    entry.mirrors = vec![
      "https://mirror-a.example.org/api".to_owned(),
      "https://mirror-b.example.org/api".to_owned(),
    ];
    assert!(entry.validate().is_ok());
    assert_eq!(
      entry.candidates(),
      vec![
        "https://ctf.example.org/api".to_owned(),
        "https://mirror-a.example.org/api".to_owned(),
        "https://mirror-b.example.org/api".to_owned(),
      ]
    );
    // one invalid mirror invalidates the whole entry, like any other field
    entry
      .mirrors
      .push("https://user:pass@mirror.example.org".to_owned());
    assert!(entry.validate().is_err());
    // the list length is bounded
    entry.mirrors = (0..=MAX_MIRRORS)
      .map(|index| format!("https://mirror-{index}.example.org/api"))
      .collect();
    assert!(entry.validate().is_err());
  }

  #[test]
  fn entry_matching_accepts_identity_and_rejects_any_divergence() {
    use super::EntryMismatch;
    let head = "0123456789abcdef0123456789abcdef01234567";
    // case-insensitive head match
    assert!(verify_entry_match("bucket_1", &head.to_uppercase(), "bucket_1", head).is_ok());
    assert_eq!(
      verify_entry_match("bucket_2", head, "bucket_1", head).unwrap_err(),
      EntryMismatch::Bucket {
        found: "bucket_2".to_owned(),
        expected: "bucket_1".to_owned(),
      }
    );
    assert_eq!(
      verify_entry_match(
        "bucket_1",
        "fedcba9876543210fedcba9876543210fedcba98",
        "bucket_1",
        head,
      )
      .unwrap_err(),
      EntryMismatch::Head {
        found: "fedcba9876543210fedcba9876543210fedcba98".to_owned(),
        expected: head.to_owned(),
      }
    );
    // both variants render actionable messages
    assert!(
      EntryMismatch::Head {
        found: "a".to_owned(),
        expected: "b".to_owned()
      }
      .to_string()
      .contains("head_ref")
    );
  }

  #[tokio::test]
  async fn the_race_takes_the_first_success_and_reports_every_failure() {
    fn pending<T: Send + 'static>(
      value: T,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send>> {
      Box::pin(std::future::ready(value))
    }
    // the fast candidate fails instantly, the slow one succeeds: the success
    // wins and the failure is collected
    let futures = vec![
      pending::<Result<u32, String>>(Err("primary down".to_owned())),
      pending(Ok(7_u32)),
    ];
    let (winner, failures) = first_ok(futures).await;
    assert_eq!(winner, Some((7, 1)));
    assert_eq!(failures, vec![(0, "primary down".to_owned())]);

    // every candidate failing returns the full failure list
    let futures = vec![
      pending::<Result<u32, String>>(Err("a".to_owned())),
      pending(Err("b".to_owned())),
    ];
    let (winner, failures) = first_ok(futures).await;
    assert_eq!(winner, None);
    assert_eq!(failures.len(), 2);
  }
}

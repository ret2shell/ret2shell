use std::{
  collections::BTreeMap,
  path::{Path, PathBuf},
};

use anyhow::{Context, anyhow, bail};
use chrono::{DateTime, Utc, serde::ts_seconds};
use r2s_config::bucket;
use r2s_database::game_registry_source;
use serde::{Deserialize, Serialize};
use tokio::{
  fs::{create_dir_all, read_dir, read_to_string, remove_dir_all},
  process::Command,
};
use tracing::warn;

use super::source_cache_dir;

const REGISTRY_KIND: &str = "ret2shell-game-registry";

#[derive(Deserialize)]
struct RegistryMetadata {
  spec_version: i32,
  kind: String,
}

#[derive(Serialize)]
struct UpstreamAdvertisement {
  spec_version: i32,
  kind: String,
  status: String,
  game_key: String,
  release_id: String,
  instance_id: String,
  role: String,
  #[serde(with = "ts_seconds")]
  published_at: DateTime<Utc>,
  base_url: String,
  auth_mode: String,
  sync_token: String,
  protocol_version: i32,
}

pub struct RegistryUpstreamPublicationRequest<'a> {
  pub game_key: &'a str,
  pub release_id: &'a str,
  pub instance_id: &'a str,
  pub role: &'a str,
  pub base_url: &'a str,
  pub sync_token: &'a str,
  pub published_at: DateTime<Utc>,
}

#[derive(Clone, Deserialize)]
struct UpstreamAdvertisementRecord {
  spec_version: i32,
  kind: String,
  status: String,
  game_key: String,
  release_id: String,
  instance_id: String,
  role: String,
  #[serde(with = "ts_seconds")]
  published_at: DateTime<Utc>,
  base_url: Option<String>,
  auth_mode: Option<String>,
  sync_token: Option<String>,
  protocol_version: Option<i32>,
}

#[derive(Clone)]
pub struct RegistryCatalogGame {
  pub game_key: String,
  pub release_count: usize,
}

#[derive(Clone)]
pub struct RegistryCatalogRelease {
  pub game_key: String,
  pub release_id: String,
  pub snapshot_commit: String,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  pub published_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct RegistryCatalogUpstream {
  pub instance_id: String,
  pub role: String,
  pub base_url: String,
  pub auth_mode: String,
  pub sync_token: String,
  pub protocol_version: i32,
  pub published_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct RegistryCatalogReleaseDetail {
  pub manifest: crate::sync::manifest::ReleaseManifest,
  pub manifest_sha256: String,
  pub upstreams: Vec<RegistryCatalogUpstream>,
}

#[derive(Clone)]
pub struct RegistryCatalogConflict {
  pub source_id: i64,
  pub source_name: String,
  pub manifest_sha256: String,
  pub snapshot_commit: String,
}

pub struct RegistryPublicationRequest<'a> {
  pub game_key: &'a str,
  pub release_id: &'a str,
  pub manifest_body: &'a str,
  pub instance_id: &'a str,
  pub base_url: &'a str,
  pub sync_token: &'a str,
  pub published_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct RegistryPublicationMetadataBundle {
  pub release_file_path: String,
  pub release_file_content: String,
  pub upstream_file_path: String,
  pub upstream_file_content: String,
}

#[derive(Serialize)]
pub struct RegistryUpstreamMetadataBundle {
  pub upstream_file_path: String,
  pub upstream_file_content: String,
}

pub async fn fetch_registry_source(
  bucket_config: &Option<bucket::Config>, source: &game_registry_source::Model,
) -> anyhow::Result<PathBuf> {
  let cache_dir = source_cache_dir(bucket_config, source.id)?;
  let mut freshly_cloned = false;
  if cache_dir.exists() && !cache_dir.join(".git").exists() {
    remove_dir_all(&cache_dir).await.ok();
  }

  if !cache_dir.exists() {
    freshly_cloned = true;
    if let Some(parent) = cache_dir.parent() {
      create_dir_all(parent).await?;
    }
    run_git(
      None,
      &[
        "clone".to_owned(),
        "--branch".to_owned(),
        source.branch.clone(),
        "--single-branch".to_owned(),
        source.git_url.clone(),
        cache_dir.to_string_lossy().to_string(),
      ],
    )
    .await?;
  } else {
    run_git(
      Some(&cache_dir),
      &[
        "remote".to_owned(),
        "set-url".to_owned(),
        "origin".to_owned(),
        source.git_url.clone(),
      ],
    )
    .await?;
    run_git(
      Some(&cache_dir),
      &[
        "fetch".to_owned(),
        "origin".to_owned(),
        source.branch.clone(),
        "--prune".to_owned(),
      ],
    )
    .await?;
    run_git(
      Some(&cache_dir),
      &[
        "checkout".to_owned(),
        "-B".to_owned(),
        source.branch.clone(),
        format!("origin/{}", source.branch),
      ],
    )
    .await?;
  }

  if let Err(err) = validate_registry_checkout(&cache_dir).await {
    if freshly_cloned {
      remove_dir_all(&cache_dir).await.ok();
    }
    return Err(err);
  }
  Ok(cache_dir)
}

pub async fn remove_registry_source_cache(
  bucket_config: &Option<bucket::Config>, source_id: i64,
) -> anyhow::Result<()> {
  let cache_dir = source_cache_dir(bucket_config, source_id)?;
  if cache_dir.exists() {
    remove_dir_all(cache_dir).await?;
  }
  Ok(())
}

pub async fn list_catalog_games(
  bucket_config: &Option<bucket::Config>, source: &game_registry_source::Model,
) -> anyhow::Result<Vec<RegistryCatalogGame>> {
  let cache_dir = fetch_registry_source(bucket_config, source).await?;
  let games_dir = cache_dir.join("games");
  let mut result = Vec::new();
  let mut entries = match read_dir(&games_dir).await {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
    Err(err) => return Err(err.into()),
  };
  while let Some(entry) = entries.next_entry().await? {
    if !entry.file_type().await?.is_dir() {
      continue;
    }
    let game_key = entry.file_name().to_string_lossy().to_string();
    let releases = list_catalog_releases_from_cache(&cache_dir, &game_key).await?;
    if releases.is_empty() {
      continue;
    }
    result.push(RegistryCatalogGame {
      game_key,
      release_count: releases.len(),
    });
  }
  result.sort_by(|left, right| left.game_key.cmp(&right.game_key));
  Ok(result)
}

pub async fn list_catalog_releases(
  bucket_config: &Option<bucket::Config>, source: &game_registry_source::Model, game_key: &str,
) -> anyhow::Result<Vec<RegistryCatalogRelease>> {
  let cache_dir = fetch_registry_source(bucket_config, source).await?;
  list_catalog_releases_from_cache(&cache_dir, game_key).await
}

async fn list_catalog_releases_from_cache(
  cache_dir: &Path, game_key: &str,
) -> anyhow::Result<Vec<RegistryCatalogRelease>> {
  let release_dir = cache_dir.join("games").join(game_key).join("releases");
  let mut result = Vec::new();
  let mut entries = match read_dir(&release_dir).await {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
    Err(err) => return Err(err.into()),
  };
  while let Some(entry) = entries.next_entry().await? {
    if !entry.file_type().await?.is_file() {
      continue;
    }
    let body = read_to_string(entry.path()).await?;
    let manifest: crate::sync::manifest::ReleaseManifest = r2s_config::toml::from_str(&body)?;
    if manifest.kind != "release" || manifest.game_key != game_key {
      continue;
    }
    let upstreams =
      load_release_upstreams(cache_dir, &manifest.game_key, &manifest.release_id).await?;
    let first_party_base_url = upstreams
      .iter()
      .find(|upstream| upstream.role == "first_party")
      .map(|upstream| upstream.base_url.clone())
      .unwrap_or_else(|| format!("instance:{}", manifest.first_party_instance_id));
    result.push(RegistryCatalogRelease {
      game_key: manifest.game_key,
      release_id: manifest.release_id,
      snapshot_commit: manifest.snapshot_commit,
      first_party_instance_id: manifest.first_party_instance_id,
      first_party_base_url,
      published_at: manifest.published_at,
    });
  }
  result.sort_by(|left, right| right.published_at.cmp(&left.published_at));
  Ok(result)
}

pub async fn get_catalog_release_detail(
  bucket_config: &Option<bucket::Config>, source: &game_registry_source::Model, game_key: &str,
  release_id: &str,
) -> anyhow::Result<RegistryCatalogReleaseDetail> {
  let cache_dir = fetch_registry_source(bucket_config, source).await?;
  get_catalog_release_detail_from_cache(&cache_dir, game_key, release_id).await
}

pub async fn list_catalog_release_conflicts(
  bucket_config: &Option<bucket::Config>, sources: &[game_registry_source::Model],
  selected_source_id: i64, game_key: &str, release_id: &str, manifest_sha256: &str,
  snapshot_commit: &str,
) -> anyhow::Result<Vec<RegistryCatalogConflict>> {
  let mut conflicts = Vec::new();
  for source in sources {
    if !source.enabled || source.id == selected_source_id {
      continue;
    }
    let cache_dir = source_cache_dir(bucket_config, source.id)?;
    if !cache_dir.exists() {
      continue;
    }
    let Ok(detail) = get_catalog_release_detail_from_cache(&cache_dir, game_key, release_id).await
    else {
      continue;
    };
    if detail.manifest_sha256 == manifest_sha256
      && detail.manifest.snapshot_commit == snapshot_commit
    {
      continue;
    }
    conflicts.push(RegistryCatalogConflict {
      source_id: source.id,
      source_name: source.name.clone(),
      manifest_sha256: detail.manifest_sha256,
      snapshot_commit: detail.manifest.snapshot_commit,
    });
  }
  conflicts.sort_by(|left, right| left.source_name.cmp(&right.source_name));
  Ok(conflicts)
}

async fn get_catalog_release_detail_from_cache(
  cache_dir: &Path, game_key: &str, release_id: &str,
) -> anyhow::Result<RegistryCatalogReleaseDetail> {
  let release_path = cache_dir
    .join("games")
    .join(game_key)
    .join("releases")
    .join(format!("{release_id}.toml"));
  let manifest_body = read_to_string(&release_path)
    .await
    .with_context(|| format!("release file not found at {}", release_path.display()))?;
  let manifest: crate::sync::manifest::ReleaseManifest = r2s_config::toml::from_str(&manifest_body)
    .with_context(|| format!("invalid release manifest at {}", release_path.display()))?;
  if manifest.kind != "release"
    || manifest.game_key != game_key
    || manifest.release_id != release_id
  {
    bail!("release manifest does not match the requested game key or release id");
  }

  Ok(RegistryCatalogReleaseDetail {
    manifest,
    manifest_sha256: r2s_captcha::sha256sum_str(&manifest_body),
    upstreams: load_release_upstreams(cache_dir, game_key, release_id).await?,
  })
}

pub fn build_registry_publication_metadata(
  release: RegistryPublicationRequest<'_>,
) -> anyhow::Result<RegistryPublicationMetadataBundle> {
  let upstream_body = build_upstream_advertisement_body(&RegistryUpstreamPublicationRequest {
    game_key: release.game_key,
    release_id: release.release_id,
    instance_id: release.instance_id,
    role: "first_party",
    base_url: release.base_url,
    sync_token: release.sync_token,
    published_at: release.published_at,
  })?;
  Ok(RegistryPublicationMetadataBundle {
    release_file_path: format!(
      "games/{}/releases/{}.toml",
      release.game_key, release.release_id
    ),
    release_file_content: release.manifest_body.to_owned(),
    upstream_file_path: format!(
      "games/{}/upstreams/{}/{}.toml",
      release.game_key,
      release.instance_id,
      release.published_at.timestamp_millis()
    ),
    upstream_file_content: upstream_body,
  })
}

pub fn build_registry_upstream_metadata(
  release: RegistryUpstreamPublicationRequest<'_>,
) -> anyhow::Result<RegistryUpstreamMetadataBundle> {
  let upstream_body = build_upstream_advertisement_body(&release)?;
  Ok(RegistryUpstreamMetadataBundle {
    upstream_file_path: format!(
      "games/{}/upstreams/{}/{}.toml",
      release.game_key,
      release.instance_id,
      release.published_at.timestamp_millis()
    ),
    upstream_file_content: upstream_body,
  })
}

fn build_upstream_advertisement_body(
  release: &RegistryUpstreamPublicationRequest<'_>,
) -> anyhow::Result<String> {
  Ok(r2s_config::toml::to_string_pretty(
    &UpstreamAdvertisement {
      spec_version: 1,
      kind: "upstream".to_owned(),
      status: "active".to_owned(),
      game_key: release.game_key.to_owned(),
      release_id: release.release_id.to_owned(),
      instance_id: release.instance_id.to_owned(),
      role: release.role.to_owned(),
      published_at: release.published_at,
      base_url: release.base_url.to_owned(),
      auth_mode: "sync_token".to_owned(),
      sync_token: release.sync_token.to_owned(),
      protocol_version: 1,
    },
  )?)
}

async fn validate_registry_checkout(path: &Path) -> anyhow::Result<()> {
  let metadata_path = path.join("registry.toml");
  let body = read_to_string(&metadata_path)
    .await
    .with_context(|| format!("registry metadata not found at {}", metadata_path.display()))?;
  validate_registry_metadata_body(&body)
    .with_context(|| format!("invalid registry metadata at {}", metadata_path.display()))
}

fn validate_registry_metadata_body(body: &str) -> anyhow::Result<()> {
  let metadata: RegistryMetadata = r2s_config::toml::from_str(body)?;
  if metadata.spec_version != 1 {
    bail!(
      "unsupported registry spec version {}",
      metadata.spec_version
    );
  }
  if metadata.kind != REGISTRY_KIND {
    bail!("invalid registry kind {}", metadata.kind);
  }
  Ok(())
}

async fn run_git(current_dir: Option<&Path>, args: &[String]) -> anyhow::Result<String> {
  run_git_with_env(current_dir, args, &[]).await
}

async fn run_git_with_env(
  current_dir: Option<&Path>, args: &[String], envs: &[(&str, &str)],
) -> anyhow::Result<String> {
  let mut cmd = Command::new("git");
  if let Some(current_dir) = current_dir {
    cmd.current_dir(current_dir);
  }
  for (key, value) in envs {
    cmd.env(key, value);
  }
  cmd.args(args);
  let output = cmd.output().await?;
  if output.status.success() {
    Ok(String::from_utf8(output.stdout)?)
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    warn!(
      ?args,
      ?stderr,
      "git command failed while handling registry discovery source"
    );
    Err(anyhow!(stderr))
  }
}

async fn load_release_upstreams(
  cache_dir: &Path, game_key: &str, release_id: &str,
) -> anyhow::Result<Vec<RegistryCatalogUpstream>> {
  let upstream_root = cache_dir.join("games").join(game_key).join("upstreams");
  let mut latest_by_instance = BTreeMap::<String, UpstreamAdvertisementRecord>::new();
  let mut instances = match read_dir(&upstream_root).await {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
    Err(err) => return Err(err.into()),
  };
  while let Some(instance_dir) = instances.next_entry().await? {
    if !instance_dir.file_type().await?.is_dir() {
      continue;
    }
    let mut files = read_dir(instance_dir.path()).await?;
    while let Some(file) = files.next_entry().await? {
      if !file.file_type().await?.is_file() {
        continue;
      }
      let body = read_to_string(file.path()).await?;
      let record: UpstreamAdvertisementRecord = match r2s_config::toml::from_str(&body) {
        Ok(record) => record,
        Err(_) => continue,
      };
      if record.spec_version != 1
        || record.kind != "upstream"
        || record.game_key != game_key
        || record.release_id != release_id
      {
        continue;
      }
      let replace = latest_by_instance
        .get(&record.instance_id)
        .is_none_or(|current| current.published_at < record.published_at);
      if replace {
        latest_by_instance.insert(record.instance_id.clone(), record);
      }
    }
  }

  let mut result = latest_by_instance
    .into_values()
    .filter(|record| record.status == "active")
    .filter_map(|record| {
      Some(RegistryCatalogUpstream {
        instance_id: record.instance_id,
        role: record.role,
        base_url: record.base_url?,
        auth_mode: record.auth_mode.unwrap_or_else(|| "sync_token".to_owned()),
        sync_token: record.sync_token?,
        protocol_version: record.protocol_version.unwrap_or(1),
        published_at: record.published_at,
      })
    })
    .collect::<Vec<_>>();
  result.sort_by(|left, right| {
    left
      .role
      .cmp(&right.role)
      .then_with(|| right.published_at.cmp(&left.published_at))
  });
  Ok(result)
}

#[cfg(test)]
mod tests {
  use chrono::{DateTime, Utc};

  use super::{
    RegistryUpstreamPublicationRequest, build_registry_upstream_metadata,
    validate_registry_metadata_body,
  };

  #[test]
  fn validate_registry_metadata_body_accepts_v1_registry() {
    validate_registry_metadata_body(
      r#"
spec_version = 1
kind = "ret2shell-game-registry"
"#,
    )
    .expect("valid registry metadata should pass");
  }

  #[test]
  fn validate_registry_metadata_body_rejects_invalid_kind() {
    let err = validate_registry_metadata_body(
      r#"
spec_version = 1
kind = "something-else"
"#,
    )
    .expect_err("invalid registry kind should fail");

    assert!(format!("{err:#}").contains("invalid registry kind"));
  }

  #[test]
  fn validate_registry_metadata_body_rejects_unsupported_version() {
    let err = validate_registry_metadata_body(
      r#"
spec_version = 2
kind = "ret2shell-game-registry"
"#,
    )
    .expect_err("unsupported registry spec version should fail");

    assert!(format!("{err:#}").contains("unsupported registry spec version"));
  }

  #[test]
  fn build_registry_upstream_metadata_uses_requested_role() {
    let publication = build_registry_upstream_metadata(RegistryUpstreamPublicationRequest {
      game_key: "game_key",
      release_id: "deadbeefcafebabe",
      instance_id: "instance-id",
      role: "third_party",
      base_url: "https://mirror.example.com",
      sync_token: "sync-token",
      published_at: DateTime::<Utc>::UNIX_EPOCH,
    })
    .expect("registry upstream metadata should build");

    assert!(
      publication
        .upstream_file_content
        .contains("role = \"third_party\"")
    );
    assert!(
      publication
        .upstream_file_path
        .contains("games/game_key/upstreams/instance-id/")
    );
  }
}

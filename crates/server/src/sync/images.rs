use std::collections::{BTreeMap, BTreeSet};

use r2s_bucket::game::GameBucket;
use r2s_cluster::Registry;
use r2s_config::cluster::{ChallengeEnv, RegistryConfig};

use crate::routes::game::repo_sync::StreamLogger;

/// Errors surfaced by the image sync step; mapped onto stable sync job error
/// codes by the import and incremental sync pipelines.
#[derive(Clone, Debug)]
pub(crate) enum ImageSyncError {
  /// A repository tag whose approved digest changed on the source: the same
  /// reference now resolves to different content and must not be trusted.
  DigestMismatch {
    reference: String,
    expected: String,
    actual: String,
  },
  Failed(String),
}

/// A parsed docker image reference split into registry host (when present),
/// repository path and tag.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ImageRef {
  host: Option<String>,
  repository: String,
  tag: String,
}

fn parse_image_reference(reference: &str) -> Option<ImageRef> {
  let reference = reference.trim();
  if reference.is_empty() {
    return None;
  }
  // split the tag at the last ':' that sits after the last '/', mirroring the
  // docker reference grammar (digest suffixes are treated as part of the tag)
  let tag_split = reference
    .rfind(':')
    .filter(|index| !reference[*index + 1..].contains('/'));
  let (name, tag) = match tag_split {
    Some(index) => (&reference[..index], reference[index + 1..].to_owned()),
    None => (reference, "latest".to_owned()),
  };
  if name.is_empty() {
    return None;
  }
  let mut segments = name.split('/');
  let first = segments.next()?.to_owned();
  let looks_like_host =
    first.contains('.') || first.contains(':') || first.eq_ignore_ascii_case("localhost");
  if looks_like_host {
    let repository = segments.collect::<Vec<_>>().join("/");
    if repository.is_empty() {
      return None;
    }
    Some(ImageRef {
      host: Some(first),
      repository,
      tag,
    })
  } else {
    Some(ImageRef {
      host: None,
      repository: name.to_owned(),
      tag,
    })
  }
}

impl ImageRef {
  fn reference(&self) -> String {
    format!(
      "{}{}:{}",
      self
        .host
        .as_ref()
        .map(|host| format!("{host}/"))
        .unwrap_or_default(),
      self.repository,
      self.tag
    )
  }
}

/// Collects the environment configuration of every challenge in the game
/// bucket. Challenge directories prefixed with `.` are skipped, matching the
/// materialization traversal.
async fn collect_envs(game_bucket: &GameBucket) -> Result<Vec<(String, ChallengeEnv)>, String> {
  let challenges_root = game_bucket.git.path().join("challenges");
  let mut entries = match tokio::fs::read_dir(&challenges_root).await {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
    Err(error) => return Err(error.to_string()),
  };
  let mut envs = Vec::new();
  while let Some(entry) = entries
    .next_entry()
    .await
    .map_err(|error| error.to_string())?
  {
    if !entry
      .file_type()
      .await
      .map_err(|error| error.to_string())?
      .is_dir()
    {
      continue;
    }
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    let challenge_bucket = game_bucket
      .at(&name)
      .await
      .map_err(|error| error.to_string())?;
    if let Some(env) = challenge_bucket
      .env()
      .await
      .map_err(|error| error.to_string())?
    {
      envs.push((name, env));
    }
  }
  Ok(envs)
}

/// Rewrites source-registry image references of a managed game onto the local
/// registry. The repository path and tag stay untouched (the images were
/// copied verbatim under the same org namespace), public references are left
/// alone, and `env.toml` in the bucket is never modified — the mapping is
/// applied wherever the environment is read for execution or display.
pub(crate) fn localize_env_images(
  env: &mut ChallengeEnv, bucket_id: &str, local_external: &str,
) -> usize {
  let local_external = local_external.trim();
  if local_external.is_empty() {
    return 0;
  }
  let namespace = format!("{bucket_id}/");
  let mut rewritten = 0;
  for image in &mut env.images {
    let Some(reference) = parse_image_reference(&image.tag) else {
      continue;
    };
    let Some(host) = reference.host.as_deref() else {
      continue;
    };
    if host.eq_ignore_ascii_case(local_external) || !reference.repository.starts_with(&namespace) {
      continue;
    }
    image.tag = format!(
      "{local_external}/{}:{}",
      reference.repository, reference.tag
    );
    rewritten += 1;
  }
  rewritten
}

/// Outcome summary of one image sync run.
#[derive(Clone, Debug, Default)]
pub(crate) struct ImagesReport {
  pub(crate) copied: usize,
  pub(crate) verified: usize,
  pub(crate) public_references: usize,
  pub(crate) external_references: usize,
  pub(crate) admission_changed: bool,
}

/// Copies every source-registry image referenced by the game's challenge
/// environments into the local registry and verifies digests end to end:
///
/// 1. references pointing at the advertised source registry (and living under
///    the game's bucket namespace) are collected;
/// 2. the source digest of each reference is resolved and compared with the
///    distribution's admission list — a changed digest under the same reference
///    is rejected outright;
/// 3. images already present locally with the same digest are only verified,
///    everything else is copied with `skopeo copy --all` and the destination
///    digest must equal the source digest;
/// 4. public and third-party references are counted and reported.
///
/// The admission map is updated in place; the caller persists it with the
/// distribution inside the surrounding database transaction.
pub(crate) async fn synchronize_images(
  state: &crate::traits::GlobalState, logger: &StreamLogger, game_bucket: &GameBucket,
  source_registry: Option<&RegistryConfig>, admission: &mut BTreeMap<String, String>,
) -> Result<ImagesReport, ImageSyncError> {
  let bucket_id = game_bucket.name.clone();
  let namespace = format!("{bucket_id}/");
  let source_address = source_registry
    .map(|config| config.server.trim().to_owned())
    .unwrap_or_default();
  let envs = collect_envs(game_bucket).await.map_err(|message| {
    ImageSyncError::Failed(format!("failed to read challenge environments: {message}"))
  })?;

  let mut to_sync: BTreeSet<(String, String)> = BTreeSet::new();
  let mut pull_secrets: BTreeSet<String> = BTreeSet::new();
  let mut report = ImagesReport::default();
  for (_, env) in &envs {
    if let Some(secret) = env.pull_secret.as_deref() {
      pull_secrets.insert(secret.to_owned());
    }
    for image in &env.images {
      let Some(reference) = parse_image_reference(&image.tag) else {
        continue;
      };
      match reference.host.as_deref() {
        Some(host) => {
          let under_namespace = reference.repository.starts_with(&namespace);
          if !source_address.is_empty() && host.eq_ignore_ascii_case(&source_address) {
            if under_namespace {
              to_sync.insert((reference.repository, reference.tag));
            } else {
              // lives on the source registry but outside this game: copied or
              // managed by whoever owns the namespace, only reported
              report.external_references += 1;
            }
          } else if under_namespace && source_address.is_empty() {
            // the source did not advertise a registry, yet references one
            // under its own namespace: content we cannot verify or copy
            return Err(ImageSyncError::Failed(format!(
              "image {} references a registry but the source did not advertise one",
              reference.reference()
            )));
          } else {
            report.external_references += 1;
          }
        }
        None => report.public_references += 1,
      }
    }
  }
  for secret in &pull_secrets {
    logger
      .warn(format!(
        "The source environment uses imagePullSecret \"{secret}\"; \
         make sure it exists in the local cluster before starting instances."
      ))
      .await;
  }
  if to_sync.is_empty() {
    logger
      .info(format!(
        "No source images to synchronize ({} public / {} external reference(s)).",
        report.public_references, report.external_references
      ))
      .await;
    return Ok(report);
  }

  let Some(source_config) = source_registry else {
    return Err(ImageSyncError::Failed(
      "challenge environments reference source-registry images but the source \
       registry is not advertised"
        .to_owned(),
    ));
  };
  let Some(local_config) = state
    .config
    .cluster
    .as_ref()
    .and_then(|cluster| cluster.registry.clone())
  else {
    return Err(ImageSyncError::Failed(
      "the local registry is not configured; image synchronization is impossible".to_owned(),
    ));
  };
  let source_client = Registry::new(source_config.clone());
  let local_client = Registry::new(local_config.clone());

  for (repository, tag) in to_sync {
    let reference = format!("{repository}:{tag}");
    logger
      .info(format!(
        "Verifying image {reference} on the source registry..."
      ))
      .await;
    let source_digest = source_client
      .manifest_digest(&repository, &tag)
      .await
      .map_err(|error| ImageSyncError::Failed(format!("source digest of {reference}: {error}")))?;
    if let Some(approved) = admission.get(&reference)
      && approved != &source_digest
    {
      return Err(ImageSyncError::DigestMismatch {
        reference,
        expected: approved.clone(),
        actual: source_digest,
      });
    }
    // already present locally with the exact content: verify only
    let local_digest = match local_client.manifest_digest(&repository, &tag).await {
      Ok(digest) if digest == source_digest => None,
      Ok(_) | Err(_) => Some(()),
    };
    if local_digest.is_none() {
      report.verified += 1;
    } else {
      logger
        .info(format!(
          "Copying image {reference} ({source_digest}) into the local registry..."
        ))
        .await;
      Registry::copy_image(source_config, &local_config, &repository, &tag)
        .await
        .map_err(|error| ImageSyncError::Failed(format!("copy of {reference}: {error}")))?;
      let copied_digest = local_client
        .manifest_digest(&repository, &tag)
        .await
        .map_err(|error| {
          ImageSyncError::Failed(format!("destination digest of {reference}: {error}"))
        })?;
      if copied_digest != source_digest {
        return Err(ImageSyncError::Failed(format!(
          "destination digest of {reference} is {copied_digest}, expected {source_digest}"
        )));
      }
      report.copied += 1;
    }
    if admission.get(&reference) != Some(&source_digest) {
      admission.insert(reference.clone(), source_digest.clone());
      report.admission_changed = true;
    }
  }
  logger
    .info(format!(
      "Image sync complete: {} copied, {} verified, {} public / {} external reference(s) untouched.",
      report.copied, report.verified, report.public_references, report.external_references
    ))
    .await;
  Ok(report)
}

#[cfg(test)]
mod tests {
  use r2s_config::cluster::{ChallengeEnv, ChallengeImage};

  use super::{localize_env_images, parse_image_reference};

  fn image(tag: &str) -> ChallengeImage {
    ChallengeImage {
      name: "web".to_owned(),
      tag: tag.to_owned(),
      ..Default::default()
    }
  }

  fn env(images: Vec<ChallengeImage>) -> ChallengeEnv {
    ChallengeEnv {
      images,
      ..Default::default()
    }
  }

  #[test]
  fn image_references_parse_into_host_repository_and_tag() {
    let parsed =
      parse_image_reference("registry.example.org:5000/bucket_9f2c/nginx:1731398400").unwrap();
    assert_eq!(parsed.host.as_deref(), Some("registry.example.org:5000"));
    assert_eq!(parsed.repository, "bucket_9f2c/nginx");
    assert_eq!(parsed.tag, "1731398400");
    assert_eq!(
      parse_image_reference("nginx").unwrap(),
      super::ImageRef {
        host: None,
        repository: "nginx".to_owned(),
        tag: "latest".to_owned(),
      }
    );
    assert_eq!(
      parse_image_reference("ghcr.io/org/repo:1.2").unwrap(),
      super::ImageRef {
        host: Some("ghcr.io".to_owned()),
        repository: "org/repo".to_owned(),
        tag: "1.2".to_owned(),
      }
    );
    assert!(
      parse_image_reference("localhost/repo:1")
        .unwrap()
        .host
        .is_some()
    );
    assert!(parse_image_reference("").is_none());
    assert!(parse_image_reference("registry.example.org/").is_none());
  }

  #[test]
  fn localize_rewrites_only_managed_namespace_references() {
    let mut managed = env(vec![
      image("src.example.org/bucket_9f2c/nginx:1731398400"),
      image("nginx:latest"),
      image("ghcr.io/third/party:1"),
      image("src.example.org/other_game/redis:7"),
      image("dst.example.org/bucket_9f2c/already-local:1"),
    ]);
    let rewritten = localize_env_images(&mut managed, "bucket_9f2c", "dst.example.org");
    assert_eq!(rewritten, 1);
    assert_eq!(
      managed.images[0].tag,
      "dst.example.org/bucket_9f2c/nginx:1731398400"
    );
    assert_eq!(managed.images[1].tag, "nginx:latest");
    assert_eq!(managed.images[2].tag, "ghcr.io/third/party:1");
    assert_eq!(managed.images[3].tag, "src.example.org/other_game/redis:7");
    assert_eq!(
      managed.images[4].tag,
      "dst.example.org/bucket_9f2c/already-local:1"
    );
  }

  #[test]
  fn localize_is_a_noop_without_a_local_address() {
    let mut managed = env(vec![image("src.example.org/bucket_9f2c/nginx:1731398400")]);
    assert_eq!(localize_env_images(&mut managed, "bucket_9f2c", "  "), 0);
    assert_eq!(
      managed.images[0].tag,
      "src.example.org/bucket_9f2c/nginx:1731398400"
    );
  }
}

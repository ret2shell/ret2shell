use std::{collections::BTreeSet, path::PathBuf, process::Stdio};

use r2s_bucket::game::GameBucket;
use r2s_database::media;
use sea_orm::DatabaseTransaction;
use tokio::{io::AsyncWriteExt, process::Command};
use url::Url;

use crate::{routes::game::repo_sync::StreamLogger, traits::GlobalState};

pub(crate) fn media_endpoints(repository_url: &Url, hash: &str) -> Result<(Url, Url), String> {
  let path = repository_url.path();
  let game_marker = path
    .rfind("/game/")
    .ok_or_else(|| "repository URL has no game identifier".to_owned())?;
  let prefix = &path[..game_marker];
  let game_id = path[game_marker + 6..]
    .split('/')
    .next()
    .filter(|segment| !segment.is_empty())
    .ok_or_else(|| "repository URL has no game identifier".to_owned())?;
  if game_id.parse::<i64>().is_err() {
    return Err("repository URL has an invalid game identifier".to_owned());
  }
  let mut protected = repository_url.clone();
  protected.set_path(&format!("{prefix}/game/{game_id}/sync/media/{hash}"));
  protected.set_query(None);
  protected.set_fragment(None);
  let mut fallback = repository_url.clone();
  fallback.set_path(&format!("{prefix}/media"));
  fallback.set_query(Some(&format!("hash={hash}")));
  fallback.set_fragment(None);
  Ok((protected, fallback))
}

pub(crate) async fn referenced_media_hashes(
  game_bucket: &GameBucket,
) -> Result<BTreeSet<String>, String> {
  let mut hashes = BTreeSet::new();
  let config = game_bucket
    .config()
    .await
    .map_err(|error| error.to_string())?;
  for hash in [config.cover, config.logo].into_iter().flatten() {
    hashes.insert(hash);
  }
  for milestone in game_bucket
    .milestones()
    .await
    .map_err(|error| error.to_string())?
    .milestones
  {
    if let Some(hash) = milestone.avatar {
      hashes.insert(hash);
    }
  }
  let challenges_root = game_bucket.git.path().join("challenges");
  let mut entries = match tokio::fs::read_dir(&challenges_root).await {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(hashes),
    Err(error) => return Err(error.to_string()),
  };
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
    if let Some(hash) = challenge_bucket
      .config()
      .await
      .map_err(|error| error.to_string())?
      .avatar
    {
      hashes.insert(hash);
    }
  }
  Ok(hashes)
}

fn curl_config(url: &Url, credential: &str) -> String {
  fn quote(value: &str) -> String {
    value
      .replace('\\', "\\\\")
      .replace('"', "\\\"")
      .replace('\n', "\\n")
      .replace('\r', "\\r")
  }
  format!(
    "url = \"{}\"\nheader = \"Authorization: Bearer {}\"\n",
    quote(url.as_str()),
    quote(credential)
  )
}

async fn download(url: &Url, credential: &str, destination: &PathBuf) -> Result<(), String> {
  let mut command = Command::new("curl");
  command
    .kill_on_drop(true)
    .arg("--fail")
    .arg("--silent")
    .arg("--show-error")
    .arg("--max-time")
    .arg("60")
    .arg("--config")
    .arg("-")
    .arg("--output")
    .arg(destination)
    .stdin(Stdio::piped())
    .stdout(Stdio::null())
    .stderr(Stdio::piped());
  let mut child = command.spawn().map_err(|error| error.to_string())?;
  child
    .stdin
    .take()
    .ok_or_else(|| "failed to open curl configuration input".to_owned())?
    .write_all(curl_config(url, credential).as_bytes())
    .await
    .map_err(|error| error.to_string())?;
  let output = child
    .wait_with_output()
    .await
    .map_err(|error| error.to_string())?;
  if output.status.success() {
    return Ok(());
  }
  let stderr = String::from_utf8_lossy(&output.stderr).replace(credential, "<redacted>");
  Err(format!("media download failed: {stderr}"))
}

pub(crate) async fn synchronize_media(
  state: &GlobalState, txn: &DatabaseTransaction, repository_url: &Url, game_bucket: &GameBucket,
  credential: &str, operator_id: i64, logger: &StreamLogger,
) -> Result<(), String> {
  let hashes = referenced_media_hashes(game_bucket).await?;
  for hash in hashes {
    if state.media.get(&hash).await.is_ok() {
      if media::get_by_hash(txn, &hash)
        .await
        .map_err(|error| error.to_string())?
        .is_none()
      {
        media::create(
          txn,
          media::Model {
            id: 0,
            hash,
            uploader_id: operator_id,
          },
        )
        .await
        .map_err(|error| error.to_string())?;
      }
      continue;
    }
    logger
      .info(format!("Downloading referenced media {hash}..."))
      .await;
    let (protected, fallback) = media_endpoints(repository_url, &hash)?;
    let temporary =
      std::env::temp_dir().join(format!("ret2shell-sync-media-{}", nanoid::nanoid!()));
    let downloaded = match download(&protected, credential, &temporary).await {
      Ok(()) => Ok(()),
      Err(_) => download(&fallback, credential, &temporary).await,
    };
    if let Err(error) = downloaded {
      tokio::fs::remove_file(&temporary).await.ok();
      return Err(error);
    }
    let file = tokio::fs::File::open(&temporary)
      .await
      .map_err(|error| error.to_string())?;
    let model = state
      .media
      .save(file)
      .await
      .map_err(|error| error.to_string())?;
    tokio::fs::remove_file(&temporary).await.ok();
    if model.hash != hash {
      state
        .media
        .delete(&model.hash)
        .await
        .map_err(|error| error.to_string())?;
      return Err("downloaded media hash does not match its reference".to_owned());
    }
    if media::get_by_hash(txn, &hash)
      .await
      .map_err(|error| error.to_string())?
      .is_none()
    {
      media::create(
        txn,
        media::Model {
          id: 0,
          hash,
          uploader_id: operator_id,
        },
      )
      .await
      .map_err(|error| error.to_string())?;
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use url::Url;

  use super::{curl_config, media_endpoints};

  #[test]
  fn media_endpoints_preserve_api_prefix_and_game_id() {
    let repository =
      Url::parse("https://ctf.example.org/custom/api/game/42/repo/example.git").unwrap();
    let (protected, fallback) = media_endpoints(&repository, "abc123").unwrap();
    assert_eq!(
      protected.as_str(),
      "https://ctf.example.org/custom/api/game/42/sync/media/abc123"
    );
    assert_eq!(
      fallback.as_str(),
      "https://ctf.example.org/custom/api/media?hash=abc123"
    );
  }

  #[test]
  fn curl_config_escapes_header_and_url_input() {
    let url = Url::parse("https://ctf.example.org/api/media?hash=abc").unwrap();
    let config = curl_config(&url, "bad\"token");
    assert!(config.contains("bad\\\"token"));
    assert!(!config.contains("bad\"token"));
  }
}

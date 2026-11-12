use std::{collections::BTreeSet, path::PathBuf, process::Stdio};

use r2s_database::{challenge, challenge_milestone, game, media};
use sea_orm::{ConnectionTrait, DatabaseTransaction};
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

/// Collects every media hash referenced by the current database rows of the
/// game: its cover/logo, all challenge avatars and all milestone avatars.
/// Runs inside the materialization transaction, so it sees the game state
/// the ongoing import or sync just wrote.
pub(crate) async fn referenced_media_hashes_from_db<C>(
  db: &C, game_id: i64,
) -> Result<BTreeSet<String>, String>
where
  C: ConnectionTrait, {
  let mut hashes = BTreeSet::new();
  let game = game::get(db, game_id)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "the game row disappeared while collecting media references".to_owned())?;
  for hash in [game.cover, game.logo].into_iter().flatten() {
    hashes.insert(hash);
  }
  for challenge in challenge::get_list(db, game_id, true)
    .await
    .map_err(|error| error.to_string())?
  {
    if let Some(hash) = challenge.avatar {
      hashes.insert(hash);
    }
  }
  for milestone in challenge_milestone::get_list(db, game_id)
    .await
    .map_err(|error| error.to_string())?
  {
    if let Some(hash) = milestone.avatar {
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
  state: &GlobalState, txn: &DatabaseTransaction, repository_url: &Url, game: &game::Model,
  credential: &str, operator_id: i64, logger: &StreamLogger,
) -> Result<(), String> {
  let hashes = referenced_media_hashes_from_db(txn, game.id).await?;
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

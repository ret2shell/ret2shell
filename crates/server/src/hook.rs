use std::path::Path;

use anyhow::{Context, anyhow};
use axum::{body::Body, http::Request};
use futures::TryStreamExt;
use hyper_util::{client::legacy::Client, rt::TokioExecutor};
use owo_colors::OwoColorize;
use r2s_cache::Cache;
use serde::{Deserialize, Serialize};
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  process::Command,
};

pub const GIT_HOOK_SESSION_DOMAIN: &str = "git-hook-session";
pub const GIT_HOOK_AUTH_DOMAIN: &str = "git-hook-auth";
pub const GIT_HOOK_TTL: i64 = 60 * 10;
const ZERO_OID: &str = "0000000000000000000000000000000000000000";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum GitHookMessageLevel {
  Header,
  Detail,
  Info,
  Warn,
  Error,
  Success,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GitHookSession {
  pub game_id: i64,
  pub game_bucket: String,
  pub user_account: String,
  pub trace_id: String,
}

#[derive(Clone, Debug)]
struct UpdatedRef {
  old_oid: String,
  new_oid: String,
  ref_name: String,
}

pub async fn run_post_receive(
  session_id: &str, auth_key: &str, base_url: &str, repo_path: &Path,
) -> anyhow::Result<()> {
  let mut stdin = tokio::io::stdin();
  let mut payload = Vec::new();
  stdin.read_to_end(&mut payload).await?;

  let client: Client<_, Body> = Client::builder(TokioExecutor::new())
    .build(hyper_util::client::legacy::connect::HttpConnector::new());
  let url = format!(
    "{base}/internal/git-hook/post-receive?session={session}&auth={auth}",
    base = base_url.trim_end_matches('/'),
    session = urlencoding::encode(session_id),
    auth = urlencoding::encode(auth_key)
  );
  let request = Request::builder()
    .method("POST")
    .uri(url)
    .header("Content-Type", "text/plain")
    .body(Body::from(payload.clone()))?;
  let response = match client.request(request).await {
    Ok(response) => response,
    Err(err) => {
      if let Err(rollback_err) = rollback_post_receive(repo_path, &payload).await {
        return Err(anyhow!(err).context(format!(
          "failed to roll the repository back after the internal hook request failed: {rollback_err}"
        )));
      }
      return Err(err.into());
    }
  };
  let status = response.status();
  let body = forward_response(Body::new(response.into_body())).await;
  if !status.is_success() {
    if let Err(rollback_err) = rollback_post_receive(repo_path, &payload).await {
      return Err(anyhow!(
        "internal hook request failed with status {status}; repository rollback also failed: {rollback_err}"
      ));
    }
    if let Err(err) = body {
      return Err(err.context(format!("internal hook request failed with status {status}")));
    }
    return Err(anyhow!("internal hook request failed with status {status}"));
  }
  body
}

async fn forward_response(body: Body) -> anyhow::Result<()> {
  let mut stream = body.into_data_stream();
  let mut stdout = tokio::io::stdout();
  while let Some(chunk) = stream.try_next().await? {
    stdout.write_all(&chunk).await?;
    stdout.flush().await?;
  }
  Ok(())
}

async fn rollback_post_receive(repo_path: &Path, payload: &[u8]) -> anyhow::Result<()> {
  let updates = parse_post_receive_updates(payload)?;
  if updates.is_empty() {
    return Ok(());
  }

  eprintln!(
    "{}",
    format_git_hook_line(
      GitHookMessageLevel::Warn,
      "Internal synchronization failed before completion; rolling the repository back locally."
    )
  );
  for update in updates.iter().rev() {
    if update.new_oid == ZERO_OID {
      update_ref(repo_path, &update.ref_name, &update.old_oid, ZERO_OID).await?;
      continue;
    }
    if update.old_oid == ZERO_OID {
      delete_ref(repo_path, &update.ref_name, &update.new_oid).await?;
      continue;
    }
    update_ref(
      repo_path,
      &update.ref_name,
      &update.old_oid,
      &update.new_oid,
    )
    .await?;
  }
  reset_hard(repo_path, "HEAD").await?;
  eprintln!(
    "{}",
    format_git_hook_line(
      GitHookMessageLevel::Success,
      "Local repository rollback completed."
    )
  );
  Ok(())
}

pub(crate) fn format_git_hook_line(level: GitHookMessageLevel, line: impl AsRef<str>) -> String {
  format_git_hook_line_with_color(level, line.as_ref(), git_hook_colors_enabled())
}

fn format_git_hook_line_with_color(
  level: GitHookMessageLevel, line: &str, use_color: bool,
) -> String {
  let prefix = match level {
    GitHookMessageLevel::Header => "==>",
    GitHookMessageLevel::Detail => "->",
    GitHookMessageLevel::Info => "[INFO]",
    GitHookMessageLevel::Warn => "[WARN]",
    GitHookMessageLevel::Error => "[ERROR]",
    GitHookMessageLevel::Success => "[OK]",
  };

  if !use_color {
    return format!("{prefix} {line}");
  }

  match level {
    GitHookMessageLevel::Header => format!("{} {}", prefix.bright_blue().bold(), line.bold()),
    GitHookMessageLevel::Detail => format!("{} {}", prefix.bright_black().bold(), line.dimmed()),
    GitHookMessageLevel::Info => format!("{} {line}", prefix.bright_blue().bold()),
    GitHookMessageLevel::Warn => format!("{} {}", prefix.yellow().bold(), line.yellow()),
    GitHookMessageLevel::Error => format!("{} {}", prefix.red().bold(), line.red()),
    GitHookMessageLevel::Success => format!("{} {}", prefix.green().bold(), line.green()),
  }
}

fn git_hook_colors_enabled() -> bool {
  std::env::var_os("NO_COLOR").is_none()
    && std::env::var("TERM").map_or(true, |term| term != "dumb")
}

fn parse_post_receive_updates(payload: &[u8]) -> anyhow::Result<Vec<UpdatedRef>> {
  let payload = std::str::from_utf8(payload).context("invalid post-receive payload encoding")?;
  let mut updates = Vec::new();
  for line in payload.lines() {
    let line = line.trim();
    if line.is_empty() {
      continue;
    }
    let mut parts = line.split_whitespace();
    let old_oid = parts
      .next()
      .ok_or_else(|| anyhow!("invalid post-receive payload"))?;
    let new_oid = parts
      .next()
      .ok_or_else(|| anyhow!("invalid post-receive payload"))?;
    let ref_name = parts
      .next()
      .ok_or_else(|| anyhow!("invalid post-receive payload"))?;
    if parts.next().is_some() {
      return Err(anyhow!("invalid post-receive payload"));
    }
    updates.push(UpdatedRef {
      old_oid: old_oid.to_owned(),
      new_oid: new_oid.to_owned(),
      ref_name: ref_name.to_owned(),
    });
  }
  Ok(updates)
}

async fn reset_hard(repo_path: &Path, rev: &str) -> anyhow::Result<()> {
  let output = Command::new("git")
    .current_dir(repo_path)
    .arg("reset")
    .arg("--hard")
    .arg(rev)
    .output()
    .await?;
  if output.status.success() {
    Ok(())
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(anyhow!(
      "failed to reset the repository to `{rev}`: {}",
      stderr.trim()
    ))
  }
}

async fn update_ref(
  repo_path: &Path, ref_name: &str, new_oid: &str, old_oid: &str,
) -> anyhow::Result<()> {
  let output = Command::new("git")
    .current_dir(repo_path)
    .arg("update-ref")
    .arg(ref_name)
    .arg(new_oid)
    .arg(old_oid)
    .output()
    .await?;
  if output.status.success() {
    Ok(())
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(anyhow!(
      "failed to update `{ref_name}` to `{new_oid}`: {}",
      stderr.trim()
    ))
  }
}

async fn delete_ref(repo_path: &Path, ref_name: &str, old_oid: &str) -> anyhow::Result<()> {
  let output = Command::new("git")
    .current_dir(repo_path)
    .arg("update-ref")
    .arg("-d")
    .arg(ref_name)
    .arg(old_oid)
    .output()
    .await?;
  if output.status.success() {
    Ok(())
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(anyhow!("failed to delete `{ref_name}`: {}", stderr.trim()))
  }
}

pub async fn cleanup_hook_session(cache: &Cache, session_id: &str) {
  cache.at(GIT_HOOK_SESSION_DOMAIN).del(session_id).await.ok();
  cache.at(GIT_HOOK_AUTH_DOMAIN).del(session_id).await.ok();
}

#[cfg(test)]
mod tests {
  use super::{GitHookMessageLevel, format_git_hook_line_with_color};

  #[test]
  fn git_hook_formats_plain_lines_without_color() {
    assert_eq!(
      format_git_hook_line_with_color(GitHookMessageLevel::Info, "syncing challenge", false),
      "[INFO] syncing challenge"
    );
    assert_eq!(
      format_git_hook_line_with_color(
        GitHookMessageLevel::Success,
        "Repository synchronization completed successfully.",
        false,
      ),
      "[OK] Repository synchronization completed successfully."
    );
  }

  #[test]
  fn git_hook_formats_colored_lines_when_enabled() {
    let line =
      format_git_hook_line_with_color(GitHookMessageLevel::Error, "Synchronization failed.", true);

    assert!(line.contains("\u{1b}["));
    assert!(line.contains("[ERROR]"));
    assert!(line.contains("Synchronization failed."));
  }
}

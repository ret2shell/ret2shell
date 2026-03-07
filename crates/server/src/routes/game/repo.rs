use std::{
  path::{Path, PathBuf},
  process::Stdio,
};

use axum::{
  Extension, Json,
  body::{Body, Bytes},
  extract::{Query, State},
  http::{
    HeaderMap, StatusCode,
    header::{CACHE_CONTROL, CONTENT_TYPE},
  },
  response::IntoResponse,
};
use futures::TryStreamExt;
use nanoid::nanoid;
use r2s_bucket::{
  Bucket,
  git::{ObjectInfo, to_pkt_line},
};
use r2s_cache::Cache;
use r2s_config::GlobalConfig;
use r2s_database::game;
use regex::Regex;
use serde::Deserialize;
use tokio::{fs, process::Command};
use tokio_stream::StreamExt;
use tokio_util::io::{ReaderStream, StreamReader};
use tower_http::request_id::RequestId;
use tracing::error;

use crate::{
  hook::{
    GIT_HOOK_AUTH_DOMAIN, GIT_HOOK_SESSION_DOMAIN, GIT_HOOK_TTL, GitHookSession,
    cleanup_hook_session,
  },
  middleware::auth::Token,
  traits::{GlobalState, ResponseError},
};

const GAME_REPO_CACHE_TTL: i64 = 60 * 5;

#[derive(Deserialize)]
pub(super) struct GameRepoGitQuery {
  pub path: Option<String>,
}

fn normalize_game_repo_path(path: Option<String>) -> String {
  let path = path.unwrap_or_else(|| ".".to_owned());
  let path = path.trim().trim_matches('/');
  if path.is_empty() {
    ".".to_owned()
  } else {
    path.to_owned()
  }
}

fn game_repo_cache_key(game_id: i64, head: &str, path: &str) -> String {
  format!("{game_id}:{head}:{path}")
}

pub(super) async fn get_game_repo_git(
  State(ref bucket): State<Bucket>, State(ref cache): State<Cache>,
  Extension(game): Extension<game::Model>, Query(query): Query<GameRepoGitQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let game_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not found".to_owned(),
        ))?,
    )
    .await?;
  let path = normalize_game_repo_path(query.path);
  let head = game_bucket.git.get_head().await?;
  let cache = cache.at("game-repo");
  let cache_key = game_repo_cache_key(game.id, &head, &path);
  if let Some(objects) = cache.get::<Vec<ObjectInfo>>(&cache_key).await? {
    return Ok(Json(objects));
  }

  let objects = game_bucket.git.list_objects(&path).await?;
  cache
    .set_ex(&cache_key, &objects, GAME_REPO_CACHE_TTL)
    .await?;

  Ok(Json(objects))
}

#[derive(Clone, Deserialize)]
pub(super) struct InfoRefsQuery {
  pub service: String,
}

struct HookSessionCredentials {
  session_id: String,
  auth_key: String,
}

impl InfoRefsQuery {
  pub fn service_trimmed(&self) -> String {
    self.service.trim_start_matches("git-").to_owned()
  }
}

fn check_git_protocol_safe(protocol: impl AsRef<str>) -> bool {
  let re = Regex::new(r"^[0-9a-zA-Z]+=[0-9a-zA-Z]+(:[0-9a-zA-Z]+=[0-9a-zA-Z]+)*$").unwrap();
  re.is_match(protocol.as_ref())
}

fn get_protocol(headers: &HeaderMap) -> Result<String, ResponseError> {
  let protocol = headers.get("Git-Protocol");
  if let Some(protocol) = protocol {
    let protocol = protocol.to_str().map_err(|err| {
      error!("Invalid git protocol: {}", err);
      ResponseError::BadRequest("invalid git protocol".to_owned())
    })?;
    if check_git_protocol_safe(protocol) {
      Ok(protocol.to_owned())
    } else {
      Err(ResponseError::BadRequest("invalid git protocol".to_owned()))
    }
  } else {
    Ok("".to_owned())
  }
}

fn ensure_receive_pack_writable(game: &game::Model) -> Result<(), ResponseError> {
  if game.hidden {
    Ok(())
  } else {
    Err(ResponseError::Forbidden(
      "The repository is read-only while the game is visible to players.".to_owned(),
    ))
  }
}

fn prepare_git_rpc_headers(
  service_name: &str, headers: &HeaderMap,
) -> Result<(String, HeaderMap), ResponseError> {
  let expected_content_type = format!("application/x-git-{service_name}-request");
  let content_type = headers.get(CONTENT_TYPE).ok_or(ResponseError::BadRequest(
    "missing content type for git rpc".to_owned(),
  ))?;
  if content_type
    .to_str()
    .map_err(|_| ResponseError::BadRequest("invalid content type for git rpc".to_owned()))?
    != expected_content_type
  {
    return Err(ResponseError::BadRequest(
      "invalid content type for git rpc".to_owned(),
    ));
  }

  let protocol = get_protocol(headers)?;
  let mut response_headers = HeaderMap::new();
  response_headers.insert(
    CONTENT_TYPE,
    format!("application/x-git-{service_name}-result")
      .parse()
      .unwrap(),
  );
  Ok((protocol, response_headers))
}

async fn create_hook_session(
  state: &GlobalState, game: &game::Model, token: &Token, trace: &RequestId,
) -> Result<HookSessionCredentials, ResponseError> {
  let session_id = nanoid!();
  let auth_key = nanoid!();
  let session = GitHookSession {
    game_id: game.id,
    game_bucket: game
      .bucket
      .clone()
      .ok_or(ResponseError::PreconditionFailed(
        "game bucket not found".to_owned(),
      ))?,
    user_account: token.account.clone(),
    trace_id: trace
      .header_value()
      .to_str()
      .unwrap_or("UNKNOWN")
      .to_owned(),
  };
  state
    .cache
    .at(GIT_HOOK_SESSION_DOMAIN)
    .set_ex(&session_id, session, GIT_HOOK_TTL)
    .await?;
  state
    .cache
    .at(GIT_HOOK_AUTH_DOMAIN)
    .set_ex(&session_id, &auth_key, GIT_HOOK_TTL)
    .await?;
  Ok(HookSessionCredentials {
    session_id,
    auth_key,
  })
}

fn internal_api_origin(config: &GlobalConfig) -> Result<String, ResponseError> {
  let server = config
    .server
    .as_ref()
    .ok_or(ResponseError::InternalServerError(
      "server configuration is not available".to_owned(),
    ))?;
  let host = match server.host.as_str() {
    "" | "0.0.0.0" => "127.0.0.1".to_owned(),
    "::" | "[::]" | "::0" | "0:0:0:0:0:0:0:0" => "[::1]".to_owned(),
    host if host.contains(':') && !host.starts_with('[') => format!("[{host}]"),
    host => host.to_owned(),
  };
  Ok(format!(
    "http://{}:{}{}",
    host, server.port, server.api_base_path
  ))
}

async fn create_post_receive_hooks_dir(
  session_id: &str, auth_key: &str, base_url: &str, repo_path: &Path,
) -> Result<PathBuf, ResponseError> {
  let dir = std::env::temp_dir().join(format!("ret2shell-git-hook-{session_id}"));
  if dir.exists() {
    fs::remove_dir_all(&dir).await.ok();
  }
  fs::create_dir_all(&dir).await?;
  let hook_path = dir.join("post-receive");
  let exe_path = std::env::current_exe().map_err(ResponseError::FileIoError)?;
  let script = format!(
    "#!/bin/sh\nexec {} internal hook post-receive --session {} --auth-key {} --base-url {} --repo-path {}\n",
    shell_quote(exe_path.as_os_str()),
    shell_quote(session_id),
    shell_quote(auth_key),
    shell_quote(base_url),
    shell_quote(repo_path.as_os_str())
  );
  fs::write(&hook_path, script).await?;
  make_executable(&hook_path).await?;
  Ok(dir)
}

async fn make_executable(path: &Path) -> Result<(), ResponseError> {
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path).await?.permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).await?;
  }
  Ok(())
}

fn shell_quote(value: impl AsRef<std::ffi::OsStr>) -> String {
  let value = value.as_ref().to_string_lossy();
  format!("'{}'", value.replace('\'', "'\\''"))
}

async fn spawn_receive_pack_with_hook(
  state: &GlobalState, repo_path: &Path, protocol: &str, hooks_path: &Path, session_id: String,
  stdin: impl tokio::io::AsyncRead + Unpin + Send + 'static, repo_lock: r2s_bucket::game::RepoLock,
) -> Result<tokio::process::ChildStdout, ResponseError> {
  let mut cmd = Command::new("git");
  cmd
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .env("GIT_PROTOCOL", protocol)
    .arg("-c")
    .arg(format!("core.hooksPath={}", hooks_path.display()))
    .arg("-c")
    .arg("receive.denyCurrentBranch=updateInstead")
    .arg("-c")
    .arg("receive.denyNonFastForwards=true")
    .arg("-c")
    .arg("receive.denyDeletes=true")
    .arg("receive-pack")
    .arg("--stateless-rpc")
    .arg(repo_path);
  let mut child = cmd.spawn().map_err(ResponseError::FileIoError)?;
  let stdout = child
    .stdout
    .take()
    .ok_or(ResponseError::InternalServerError(
      "failed to capture git stdout".to_owned(),
    ))?;
  let mut child_stdin = child
    .stdin
    .take()
    .ok_or(ResponseError::InternalServerError(
      "failed to capture git stdin".to_owned(),
    ))?;
  let cache = state.cache.clone();
  let hook_dir = hooks_path.to_path_buf();
  tokio::spawn(async move {
    let mut stdin = stdin;
    tokio::io::copy(&mut stdin, &mut child_stdin).await.ok();
    drop(child_stdin);
    child.wait().await.ok();
    cleanup_hook_session(&cache, &session_id).await;
    fs::remove_dir_all(hook_dir).await.ok();
    drop(repo_lock);
  });
  Ok(stdout)
}

pub(super) async fn game_repo_info_refs(
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Query(query): Query<InfoRefsQuery>, headers: HeaderMap, body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  let service = query.service_trimmed();
  if service == "receive-pack" {
    ensure_receive_pack_writable(&game)?;
  }
  let protocol = get_protocol(&headers)?;
  let mut headers = HeaderMap::new();

  headers.insert(
    CONTENT_TYPE,
    format!("application/x-git-{service}-advertisement")
      .parse()
      .unwrap(),
  );
  headers.insert(CACHE_CONTROL, "no-cache".parse().unwrap());

  let game_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not found".to_owned(),
        ))?,
    )
    .await?;

  let stream_reader = StreamReader::new(body.into_data_stream().map_err(std::io::Error::other));

  let stdout = match service.as_str() {
    "upload-pack" => {
      game_bucket
        .git
        .info_refs_upload(protocol, stream_reader)
        .await
    }
    "receive-pack" => {
      game_bucket
        .git
        .info_refs_receive(protocol, stream_reader)
        .await
    }
    _ => return Err(ResponseError::BadRequest("Invalid git service".to_owned())),
  };

  let stdout = match stdout {
    Ok(stdout) => stdout,
    Err(err) => {
      error!(error=?err, "failed to run git rpc");
      return Err(ResponseError::InternalServerError(
        "failed to run git rpc".to_owned(),
      ));
    }
  };

  let stdout_stream = ReaderStream::new(stdout);
  let header = tokio_stream::once(Ok(Bytes::from(format!(
    "{}0000",
    to_pkt_line(format!("# service=git-{service}\n"))
  ))));
  let stream = header.chain(stdout_stream);

  Ok((StatusCode::OK, headers, Body::from_stream(stream)))
}

async fn game_repo_git_rpc(
  service_name: &str, bucket: Bucket, game: game::Model, headers: HeaderMap, body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  let (protocol, headers) = prepare_git_rpc_headers(service_name, &headers)?;

  let game_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not found".to_owned(),
        ))?,
    )
    .await?;
  let stream_reader = StreamReader::new(body.into_data_stream().map_err(std::io::Error::other));

  let stdout = match service_name {
    "upload-pack" => game_bucket.git.upload_pack(protocol, stream_reader).await,
    "receive-pack" => game_bucket.git.receive_pack(protocol, stream_reader).await,
    _ => return Err(ResponseError::BadRequest("invalid git service".to_owned())),
  };

  let stdout = match stdout {
    Ok(stdout) => stdout,
    Err(err) => {
      error!(error=?err, "failed to run git rpc");
      return Err(ResponseError::InternalServerError(
        "failed to run git rpc".to_owned(),
      ));
    }
  };

  let stdout_stream = ReaderStream::new(stdout);

  Ok((StatusCode::OK, headers, Body::from_stream(stdout_stream)))
}

pub(super) async fn game_repo_git_receive_pack(
  State(state): State<GlobalState>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, Extension(trace): Extension<RequestId>, headers: HeaderMap,
  body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  ensure_receive_pack_writable(&game)?;
  let (protocol, headers) = prepare_git_rpc_headers("receive-pack", &headers)?;
  let base_url = internal_api_origin(&state.config)?;
  let bucket_name = game
    .bucket
    .clone()
    .ok_or(ResponseError::PreconditionFailed(
      "game bucket not found".to_owned(),
    ))?;
  let repo_lock = match state.bucket.lock(&bucket_name) {
    Ok(lock) => lock,
    Err(r2s_bucket::BucketError::LockError) => {
      return Err(ResponseError::Conflict(
        "another repository write operation is already in progress for this game".to_owned(),
      ));
    }
    Err(err) => return Err(err.into()),
  };
  let game_bucket = state.bucket.at(&bucket_name).await?;
  let hook_session = create_hook_session(&state, &game, &token, &trace).await?;
  let hooks_dir = match create_post_receive_hooks_dir(
    &hook_session.session_id,
    &hook_session.auth_key,
    &base_url,
    game_bucket.git.path(),
  )
  .await
  {
    Ok(dir) => dir,
    Err(err) => {
      cleanup_hook_session(&state.cache, &hook_session.session_id).await;
      return Err(err);
    }
  };

  let stream_reader = StreamReader::new(body.into_data_stream().map_err(std::io::Error::other));
  let stdout = match spawn_receive_pack_with_hook(
    &state,
    game_bucket.git.path(),
    &protocol,
    &hooks_dir,
    hook_session.session_id.clone(),
    stream_reader,
    repo_lock,
  )
  .await
  {
    Ok(stdout) => stdout,
    Err(err) => {
      cleanup_hook_session(&state.cache, &hook_session.session_id).await;
      fs::remove_dir_all(hooks_dir).await.ok();
      return Err(err);
    }
  };
  let stdout_stream = ReaderStream::new(stdout);
  Ok((StatusCode::OK, headers, Body::from_stream(stdout_stream)))
}

pub(super) async fn game_repo_git_upload_pack(
  State(bucket): State<Bucket>, Extension(game): Extension<game::Model>, headers: HeaderMap,
  body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  game_repo_git_rpc("upload-pack", bucket, game, headers, body).await
}

#[cfg(test)]
mod tests {
  use super::{game_repo_cache_key, normalize_game_repo_path};

  #[test]
  fn normalize_game_repo_path_collapses_root_and_trailing_slashes() {
    assert_eq!(normalize_game_repo_path(None), ".");
    assert_eq!(normalize_game_repo_path(Some("".to_owned())), ".");
    assert_eq!(normalize_game_repo_path(Some("/".to_owned())), ".");
    assert_eq!(normalize_game_repo_path(Some("./".to_owned())), ".");
    assert_eq!(
      normalize_game_repo_path(Some(" challenges/ ".to_owned())),
      "challenges"
    );
    assert_eq!(
      normalize_game_repo_path(Some("/challenges/world/".to_owned())),
      "challenges/world"
    );
  }

  #[test]
  fn game_repo_cache_key_uses_game_head_and_path() {
    assert_eq!(
      game_repo_cache_key(42, "deadbeef", "challenges/world"),
      "42:deadbeef:challenges/world"
    );
  }
}

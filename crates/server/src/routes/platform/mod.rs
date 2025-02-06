use std::{path::PathBuf, str::FromStr};

use axum::{
  extract::{
    ws::{Message, WebSocket},
    Query, State, WebSocketUpgrade,
  },
  middleware,
  response::{IntoResponse, Response},
  routing::get,
  Extension, Json, Router,
};
use futures::future::join_all;
use r2s_cache::Cache;
use r2s_config::GlobalConfig;
use r2s_database::{
  challenge, config,
  game::{self, HostType},
  institute, ip, submission,
  user::{self, Permission},
};
use r2s_license::{License, LicenseLevel};
use r2s_migrator::Database;
use sea_orm::DbErr;
use serde::{Deserialize, Serialize};
use tokio::{fs, io::AsyncBufReadExt, time::timeout};
use tracing::{debug, error};

use crate::{
  middleware::auth,
  traits::{GlobalState, ResponseError},
  utility::file::send_file,
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .merge(
      Router::new()
        .route("/config", get(get_config).patch(update_config))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::DevOps
        ))),
    )
    .merge(
      Router::new()
        .route("/statistics", get(get_platform_statistics))
        .route("/logs", get(get_logs_list))
        .route_layer(middleware::from_fn(auth::permission_required_any!(
          Permission::Statistics,
          Permission::DevOps
        ))),
    )
    .route("/info", get(get_platform_info))
    .route("/auth", get(get_auth_config))
    .route("/version", get(get_version))
    .route("/logs/stream", get(platform_stream_logs))
    .route("/license", get(get_license))
}

async fn get_config(
  Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(config))
}

async fn update_config(
  State(ref db): State<Database>, State(ref cache): State<Cache>, Json(config): Json<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let result = config::update(&db.conn, config).await?;
  cache.at("platform").del("config").await?;
  Ok(Json(result))
}

async fn get_platform_info(
  State(ref license): State<License>, Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let mut server_config = config.server.clone().unwrap_or_default();
  if license.level < LicenseLevel::Enterprise {
    server_config.hide_maker = Some(false);
  }
  Ok(Json(server_config.desensitize()))
}

async fn get_auth_config(
  State(config): State<GlobalConfig>,
) -> Result<impl IntoResponse, ResponseError> {
  let auth_config = config.auth.ok_or(ResponseError::InternalServerError(
    "missing auth config".to_owned(),
    "".to_owned(),
  ))?;
  Ok(Json(auth_config.desensitize()))
}

async fn get_version(
  State(ref version): State<String>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(version.clone()))
}

#[derive(Serialize)]
struct UserStatistics {
  pub total: u64,
  pub valid: u64,
  pub institutes: Vec<(i64, u64)>,
  pub ips: u64,
}

#[derive(Serialize)]
struct SubmissionStatistics {
  pub total: u64,
  pub solved: u64,
}

#[derive(Serialize)]
struct ChallengeStatistics {
  pub total: u64,
  pub in_game: u64,
}

#[derive(Serialize)]
struct Statistics {
  pub users: UserStatistics,
  pub institutes: Vec<institute::Model>,
  pub games: Vec<game::StatisticsModel>,
  pub submissions: SubmissionStatistics,
  pub challenges: ChallengeStatistics,
}

async fn get_platform_statistics(
  State(ref db): State<Database>,
) -> Result<impl IntoResponse, ResponseError> {
  let institutes = institute::get_list(&db.conn).await?;
  let users = UserStatistics {
    total: user::count(&db.conn, true, None, None, false).await?,
    valid: user::count(&db.conn, false, None, None, false).await?,
    institutes: join_all(institutes.iter().map(|i| async {
      Ok((
        i.id,
        user::count(&db.conn, true, Some(i.id), None, false).await?,
      ))
    }))
    .await
    .into_iter()
    .map(|r: Result<(i64, u64), DbErr>| r.unwrap_or((0, 0)))
    .collect(),
    ips: ip::count(&db.conn).await?,
  };
  let games = game::get_statistics(&db.conn).await?;
  let submissions = SubmissionStatistics {
    total: submission::count(&db.conn, false, None, None, None, None, None, false).await?,
    solved: submission::count(&db.conn, true, None, None, None, None, None, false).await?,
  };
  let challenges = ChallengeStatistics {
    total: challenge::count(&db.conn, None, None, true).await?,
    in_game: challenge::count(&db.conn, None, Some(HostType::Game), true).await?,
  };
  let statistics = Statistics {
    users,
    institutes,
    games,
    submissions,
    challenges,
  };
  Ok(Json(statistics))
}

#[derive(Deserialize)]
struct LogRequest {
  pub token: String,
}

async fn platform_stream_logs(
  State(config): State<GlobalConfig>, State(ref cache): State<Cache>,
  Query(req): Query<LogRequest>, ws: WebSocketUpgrade,
) -> Result<impl IntoResponse, ResponseError> {
  // info!(
  //     "user {}:'{}' ({}) requested to stream platform logs.",
  //     token.id, token.account, token.nickname
  // );
  let valid = cache.at("token").exists(&req.token).await?;

  let token = if valid {
    auth::decode_token(&req.token, &config.auth.clone().unwrap().signing_key).await
  } else {
    auth::Token::default()
  };
  if !token.permissions.0.contains(&Permission::DevOps)
    && !token.permissions.0.contains(&Permission::Statistics)
  {
    return Err(ResponseError::Forbidden(
      "permission denied".to_owned(),
      format!(
        "somebody try to access platform logs without bad token {:?}.",
        token
      ),
    ));
  }
  let resp = ws.on_upgrade(|ws| stream_logs_worker(ws, config));
  Ok(resp)
}

async fn stream_logs_worker(ws: WebSocket, config: GlobalConfig) {
  let result = _stream_logs_worker(ws, config).await;
  if let Err(e) = result {
    error!("stream_logs_worker error: {:?}", e);
  }
}

async fn _stream_logs_worker(mut ws: WebSocket, config: GlobalConfig) -> Result<(), ResponseError> {
  let log_dir = PathBuf::from_str(
    &config
      .logging
      .ok_or(ResponseError::InternalServerError(
        "missing log config".to_owned(),
        "missing log config".to_owned(),
      ))?
      .directory,
  )
  .ok();
  if let Some(log_dir) = log_dir {
    let current_log = log_dir.join(format!(
      "ret2shell.{}.log",
      chrono::Utc::now().format("%Y-%m-%d")
    ));
    let mut timer = tokio::time::interval(tokio::time::Duration::from_secs(1));
    let mut lines = fs::File::open(&current_log)
      .await
      .map(tokio::io::BufReader::new)
      .map(tokio::io::BufReader::lines)?;
    let interval = tokio::time::Duration::from_secs(5);
    loop {
      while let Ok(log) = timeout(interval, lines.next_line()).await {
        let log = match log {
          Ok(Some(log)) => log,
          Ok(None) => break,
          Err(e) => {
            error!("failed to read log: {:?}", e);
            break;
          }
        };
        let result = ws.send(Message::Text(log.into())).await;
        if result.is_err() {
          return Ok(());
        }
      }
      let result = ws.send(Message::Ping(vec![].into())).await;
      if result.is_err() {
        return Ok(());
      }
      let _ = ws.recv().await;
      timer.tick().await;
    }
  } else {
    ws.send(Message::Close(None)).await.ok();
  }

  Ok(())
}

#[derive(Deserialize)]
struct LogListRequest {
  pub file: Option<String>,
}

async fn get_logs_list(
  State(config): State<GlobalConfig>, Query(req): Query<LogListRequest>,
) -> Result<Response, ResponseError> {
  let log_dir = PathBuf::from_str(
    &config
      .logging
      .ok_or(ResponseError::InternalServerError(
        "missing log config".to_owned(),
        "missing log config".to_owned(),
      ))?
      .directory,
  )
  .ok();
  if let Some(log_dir) = log_dir {
    if let Some(file_name) = req.file {
      let file_path = log_dir.join(file_name).canonicalize()?;
      debug!("get_logs_list: {:?}", file_path);
      debug!("log_dir: {:?}", log_dir);
      // avoid path traversal
      if file_path.starts_with(log_dir.canonicalize()?) {
        send_file(file_path).await
      } else {
        Err(ResponseError::NotFound("file not found".to_owned()))
      }
    } else {
      let mut files = fs::read_dir(log_dir).await?;
      let mut file_list = Vec::new();
      while let Some(file) = files.next_entry().await? {
        if let Some(file_name) = file.file_name().to_str() {
          file_list.push(file_name.to_owned());
        }
      }
      Ok(Json(file_list).into_response())
    }
  } else {
    Err(ResponseError::InternalServerError(
      "missing log config".to_owned(),
      "missing log config".to_owned(),
    ))
  }
}

async fn get_license(
  State(ref license): State<License>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(license.clone()))
}

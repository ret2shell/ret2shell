use std::{path::PathBuf, str::FromStr};

use axum::{
  Extension, Json, Router,
  extract::{Query, State},
  middleware,
  response::{IntoResponse, Response},
  routing::{get, patch, post},
};

mod sync;
use chrono::{DateTime, Utc};
use futures::future::join_all;
use r2s_database::{
  challenge, config,
  game::{self, HostType},
  institute, ip, submission,
  user::{self, Permission},
};
use sea_orm::DbErr;
use serde::{Deserialize, Serialize};
use tokio::fs;
use tracing::{debug, error, warn};

use crate::{
  middleware::auth,
  traits::{GlobalState, ResponseError},
  utility::{
    file::send_file,
    pagination::{DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT, limit},
  },
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  tokio::spawn(crate::worker::sync::spawn_sync_worker(state.clone()));
  Router::<GlobalState>::new()
    .merge(
      Router::<GlobalState>::new()
        .route("/config", get(get_config).patch(update_config))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::DevOps
        ))),
    )
    .merge(
      Router::<GlobalState>::new()
        .route("/statistics", get(get_platform_statistics))
        .route("/logs/query", get(get_logs))
        .route("/logs", get(get_logs_list))
        .route_layer(middleware::from_fn(auth::permission_required_any!(
          Permission::Statistics,
          Permission::DevOps
        ))),
    )
    .merge(
      Router::<GlobalState>::new()
        .route("/sync/import", post(sync::import_game))
        .route(
          "/sync/sources",
          get(sync::list_sync_sources).post(sync::create_sync_source),
        )
        .route(
          "/sync/sources/{id}",
          patch(sync::patch_sync_source).delete(sync::delete_sync_source),
        )
        .route(
          "/sync/sources/{id}/jobs",
          get(sync::list_sync_jobs).post(sync::trigger_sync_job),
        )
        .route("/sync/jobs/{id}", get(sync::get_sync_job))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::DevOps
        ))),
    )
    .route("/info", get(get_platform_info))
    .route("/auth", get(get_auth_config))
    .route("/version", get(get_version))
    .route("/license", get(get_license))
}

async fn get_config(
  State(_state): State<GlobalState>, Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(config))
}

async fn update_config(
  State(state): State<GlobalState>, Json(config): Json<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let result = config::update(&state.db.conn, config).await?;
  state.cache.at("platform").del("config").await?;
  Ok(Json(result))
}

async fn get_platform_info(
  State(_state): State<GlobalState>, Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(
    config.server.clone().unwrap_or_default().desensitize(),
  ))
}

async fn get_auth_config(
  State(state): State<GlobalState>,
) -> Result<impl IntoResponse, ResponseError> {
  let auth_config = state.config.auth.ok_or(ResponseError::InternalServerError(
    "missing auth config".to_owned(),
  ))?;
  Ok(Json(auth_config.desensitize()))
}

async fn get_version(State(state): State<GlobalState>) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(state.version))
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
  pub training: u64,
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
  State(state): State<GlobalState>,
) -> Result<impl IntoResponse, ResponseError> {
  let db = &state.db;
  let institutes = institute::get_list(&db.conn).await?;
  let users = UserStatistics {
    total: user::count(&db.conn, true, None, None, true).await?,
    valid: user::count(&db.conn, false, None, None, true).await?,
    institutes: join_all(institutes.iter().map(|i| async {
      Ok((
        i.id,
        user::count(&db.conn, true, Some(i.id), None, true).await?,
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
    total: submission::count(&db.conn, false, None, None, None, None, None, true).await?,
    solved: submission::count(&db.conn, true, None, None, None, None, None, true).await?,
  };
  let challenges = ChallengeStatistics {
    total: challenge::count(&db.conn, None, None, true).await?,
    training: challenge::count(&db.conn, None, Some(HostType::Training), true).await?,
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
struct LogListRequest {
  pub file: Option<String>,
}

async fn get_logs_list(
  State(state): State<GlobalState>, Query(req): Query<LogListRequest>,
) -> Result<Response, ResponseError> {
  let log_dir = PathBuf::from_str(
    &state
      .config
      .logging
      .ok_or(ResponseError::InternalServerError(
        "missing log config".to_owned(),
      ))?
      .directory,
  )
  .ok();
  if let Some(log_dir) = log_dir {
    if let Some(file_name) = req.file {
      let log_path = log_dir.join(file_name).canonicalize()?;
      debug!(?log_path, ?log_dir, "got log file");
      // avoid path traversal
      if log_path.starts_with(log_dir.canonicalize()?) {
        send_file(log_path).await
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
    ))
  }
}

#[derive(Deserialize)]
struct LogQuery {
  #[serde(with = "chrono::serde::ts_seconds")]
  pub started_at: DateTime<Utc>,
  #[serde(with = "chrono::serde::ts_seconds")]
  pub ended_at: DateTime<Utc>,
  pub limit: Option<usize>,
  pub level: Option<String>,
  pub trace: Option<String>,
  pub from: Option<String>,
  pub account: Option<String>,
  pub query: Option<String>,
}

async fn get_logs(
  State(state): State<GlobalState>, Query(req): Query<LogQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let log_config = if let Some(c) = state.config.logging {
    c
  } else {
    error!("missing log config");
    return Err(ResponseError::InternalServerError(
      "missing log config".to_owned(),
    ));
  };
  let victoria_url = if let Some(url) = log_config.victoria {
    url
  } else {
    warn!("victoria log server is not enabled");
    return Err(ResponseError::PreconditionFailed(
      "victoria log server is not enabled".to_owned(),
    ));
  };

  let query = if let Some(q) = req.query {
    q
  } else {
    let mut result = String::new();
    result.push_str(&format!(
      "_time:[{}, {}]",
      req.started_at.timestamp_millis(),
      req.ended_at.timestamp_millis()
    ));
    if let Some(level) = req.level {
      result.push_str(&format!(" AND level:{}", level));
    }
    if let Some(trace) = req.trace {
      result.push_str(&format!(" AND span.trace:{}", trace));
    }
    if let Some(from) = req.from {
      result.push_str(&format!(" AND span.from:{}", from));
    }
    if let Some(account) = req.account {
      result.push_str(&format!(" AND span.user-account:{}", account));
    }
    result.push_str(" | sort by (_time) desc");
    result.push_str(&format!(
      " | limit {}",
      limit(req.limit, DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT)
    ));
    result
  };
  // escape result with url encode
  let query = urlencoding::encode(&query);

  let final_url = format!("{victoria_url}/select/logsql/query?timeout=5s&query={query}");
  debug!(url=%final_url, "proxying to victoria");
  let resp = state
    .requestor
    .get(final_url.parse().unwrap())
    .await
    .map_err(|err| {
      error!(error=?err, "victoria proxy failed");
      ResponseError::InternalServerError(format!("victoria proxy failed: {err}"))
    })?;
  debug!(?resp, "proxying registry response");
  Ok(resp.into_response())
}

#[derive(Serialize)]
struct PlatformLicenseInfo {
  spdx_id: &'static str,
  name: &'static str,
  url: &'static str,
  notice: &'static str,
  content: &'static str,
}

const R2S_PUBLIC_LICENSE_TEXT: &str = include_str!("../../../../../LICENSE");

async fn get_license(
  State(_state): State<GlobalState>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(PlatformLicenseInfo {
    spdx_id: "LicenseRef-Ret2Shell-Public-2.0",
    name: "Ret2Shell Public License 2.0",
    url: "/license",
    notice: "Ret2Shell is released under the Ret2Shell Public License 2.0, a GPL-3.0-derived copyleft license with limited user-facing monetization restrictions.",
    content: R2S_PUBLIC_LICENSE_TEXT,
  }))
}

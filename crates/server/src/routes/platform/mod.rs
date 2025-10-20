use std::{path::PathBuf, str::FromStr};

use axum::{
  Extension, Json, Router,
  extract::{Query, State},
  middleware,
  response::{IntoResponse, Response},
  routing::{get, patch},
};
use chrono::{DateTime, Utc};
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
use tokio::fs;
use tracing::{debug, error, warn};

use crate::{
  middleware::auth,
  traits::{GlobalState, HTTPClient, ResponseError},
  utility::file::send_file,
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .merge(
      Router::new()
        .route("/config", get(get_config).patch(update_config))
        .route(
          "/registrar",
          patch(update_registrar_script).delete(delete_registrar_script),
        )
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::DevOps
        ))),
    )
    .merge(
      Router::new()
        .route("/statistics", get(get_platform_statistics))
        .route("/logs/query", get(get_logs))
        .route("/logs", get(get_logs_list))
        .route_layer(middleware::from_fn(auth::permission_required_any!(
          Permission::Statistics,
          Permission::DevOps
        ))),
    )
    .route("/info", get(get_platform_info))
    .route("/auth", get(get_auth_config))
    .route("/version", get(get_version))
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

#[derive(Serialize)]
struct RegistrarScriptResponse {
  pub lint: Vec<r2s_engine::DiagnosticMarker>,
}

#[derive(Deserialize)]
struct RegistrarScriptRequest {
  registrar: String,
}

async fn update_registrar_script(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(config): Extension<config::Model>, Json(req): Json<RegistrarScriptRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let registrar = r2s_registrar::Registrar;
  let lint = registrar.lint(&req.registrar).await?;
  let _ = r2s_database::config::update(
    &db.conn,
    r2s_database::config::Model {
      auth: Some(r2s_config::auth::Config {
        registrar_script: Some(req.registrar.clone()),
        ..config.auth.unwrap_or(r2s_config::auth::Config {
          signing_key: String::new(),
          buffer_time: 21600,
          expires_time: 86400,
          registrar_script: None,
        })
      }),
      ..config
    },
  )
  .await?;
  registrar.expire("default").await;
  cache.at("platform").del("config").await?;
  Ok(Json(RegistrarScriptResponse { lint }))
}

async fn delete_registrar_script(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let _ = r2s_database::config::update(
    &db.conn,
    r2s_database::config::Model {
      auth: Some(r2s_config::auth::Config {
        registrar_script: None,
        ..config.auth.unwrap_or(r2s_config::auth::Config {
          signing_key: String::new(),
          buffer_time: 21600,
          expires_time: 86400,
          registrar_script: None,
        })
      }),
      ..config
    },
  )
  .await?;
  r2s_registrar::Registrar.expire("default").await;
  cache.at("platform").del("config").await?;
  Ok(())
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
  State(config): State<GlobalConfig>, State(client): State<HTTPClient>, Query(req): Query<LogQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let log_config = if let Some(c) = config.logging {
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
    if let Some(limit) = req.limit {
      result.push_str(&format!(" | limit {}", limit));
    } else {
      result.push_str(" | limit 1000");
    }
    result
  };
  // escape result with url encode
  let query = urlencoding::encode(&query);

  let final_url = format!("{victoria_url}/select/logsql/query?timeout=5s&query={query}");
  debug!(url=%final_url, "proxying to victoria");
  let resp = client
    .get(final_url.parse().unwrap())
    .await
    .map_err(|err| {
      error!(error=?err, "victoria proxy failed");
      ResponseError::InternalServerError(format!("victoria proxy failed: {err}"))
    })?;
  debug!(?resp, "proxying registry response");
  Ok(resp.into_response())
}

async fn get_license(
  State(ref license): State<License>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(license.clone()))
}

use std::time::Duration;

use axum::{
  Extension, Json,
  body::{Body, Bytes},
  extract::{Path, Query, State},
  http::{HeaderMap, StatusCode},
  response::IntoResponse,
};
use r2s_database::sync_job;
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::request_id::RequestId;

use super::super::game::{hook::GitHookFormatter, repo_sync::AbortOnDropStream};
use crate::{
  middleware::auth::Token,
  sync::{
    import::{execute_import, normalize_repository_url},
    job, source,
  },
  traits::{GlobalState, ResponseError},
};

#[derive(Deserialize)]
pub(super) struct ImportRequest {
  repository_url: String,
  token: String,
}

pub(super) async fn import_game(
  State(state): State<GlobalState>, Extension(operator): Extension<Token>,
  Extension(trace): Extension<RequestId>, headers: HeaderMap, Json(request): Json<ImportRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let repository_url = normalize_repository_url(&request.repository_url)?;
  if request.token.trim().is_empty() {
    return Err(ResponseError::BadRequest(
      "source credential is required".to_owned(),
    ));
  }
  let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(64);
  let logger =
    crate::routes::game::repo_sync::StreamLogger::new(tx, GitHookFormatter::from_headers(&headers));
  let task_logger = logger.clone();
  let trace_id = trace
    .header_value()
    .to_str()
    .unwrap_or("UNKNOWN")
    .to_owned();
  let handle = tokio::spawn(async move {
    match tokio::time::timeout(
      Duration::from_secs(600),
      execute_import(
        state.clone(),
        repository_url.clone(),
        request.token.clone(),
        operator.id,
        trace_id,
        task_logger.clone(),
      ),
    )
    .await
    {
      Ok(Ok(model)) => {
        // the import itself is complete and durable; auto-registration only
        // wires up future incremental updates, so its failure is reported
        // without failing the import
        match source::register_imported_game(&state, &model, &repository_url, &request.token).await
        {
          Ok(source) => {
            task_logger
              .info(format!(
                "Registered sync source #{} for future incremental updates.",
                source.id
              ))
              .await;
          }
          Err(error) => {
            task_logger
              .warn(format!(
                "The game was imported, but registering its sync source failed: {error}"
              ))
              .await;
          }
        }
      }
      Ok(Err(error)) => {
        task_logger.error(format!("Import failed: {error}")).await;
      }
      Err(_) => {
        task_logger
          .error("Import timed out; partial data was cleaned up.")
          .await;
      }
    }
  });
  let stream = AbortOnDropStream::new(ReceiverStream::new(rx), handle.abort_handle());
  Ok((
    StatusCode::OK,
    [("Content-Type", "text/plain; charset=utf-8")],
    Body::from_stream(stream),
  ))
}

pub(super) async fn list_sync_sources(
  State(state): State<GlobalState>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(source::list_sources(&state).await?))
}

#[derive(Deserialize)]
pub(super) struct CreateSourceRequest {
  repository_url: String,
  token: String,
  local_game_id: i64,
  #[serde(default)]
  enabled: bool,
  interval_seconds: Option<i64>,
}

pub(super) async fn create_sync_source(
  State(state): State<GlobalState>, Extension(operator): Extension<Token>,
  Json(request): Json<CreateSourceRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let repository_url = normalize_repository_url(&request.repository_url)?;
  let created = source::create_source(
    &state,
    repository_url,
    request.token,
    request.local_game_id,
    request.enabled,
    request.interval_seconds,
    operator.id,
  )
  .await?;
  Ok((StatusCode::CREATED, Json(created)))
}

/// `Option<Option<i64>>` keeps `null` (clear the interval) distinct from a
/// missing field (keep the interval).
fn deserialize_double_option<'de, D>(deserializer: D) -> Result<Option<Option<i64>>, D::Error>
where
  D: serde::Deserializer<'de>, {
  Ok(Some(Option::<i64>::deserialize(deserializer)?))
}

#[derive(Deserialize)]
pub(super) struct PatchSourceRequest {
  token: Option<String>,
  enabled: Option<bool>,
  #[serde(default, deserialize_with = "deserialize_double_option")]
  interval_seconds: Option<Option<i64>>,
}

pub(super) async fn patch_sync_source(
  State(state): State<GlobalState>, Path(id): Path<i64>, Json(request): Json<PatchSourceRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(
    source::patch_source(
      &state,
      id,
      request.token,
      request.enabled,
      request.interval_seconds,
    )
    .await?,
  ))
}

pub(super) async fn delete_sync_source(
  State(state): State<GlobalState>, Path(id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  source::delete_source(&state, id).await?;
  Ok(())
}

pub(super) async fn trigger_sync_job(
  State(state): State<GlobalState>, Extension(trace): Extension<RequestId>, Path(id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  let job = job::enqueue_job(&state, id, sync_job::TRIGGER_MANUAL, Some(&trace)).await?;
  let runner_state = state.clone();
  let (source_id, job_id) = (job.source_id, job.id);
  tokio::spawn(async move {
    job::run_job(runner_state, source_id, job_id).await;
  });
  Ok((StatusCode::ACCEPTED, Json(job)))
}

#[derive(Deserialize)]
pub(super) struct ListJobsQuery {
  limit: Option<u64>,
}

pub(super) async fn list_sync_jobs(
  State(state): State<GlobalState>, Path(id): Path<i64>, Query(query): Query<ListJobsQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if r2s_database::sync_source::get(&state.db.conn, id)
    .await?
    .is_none()
  {
    return Err(ResponseError::NotFound("sync source".to_owned()));
  }
  let limit = query.limit.unwrap_or(50).min(200);
  let jobs = sync_job::get_list_by_source(&state.db.conn, id, limit).await?;
  Ok(Json(jobs))
}

pub(super) async fn get_sync_job(
  State(state): State<GlobalState>, Path(id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  let job = sync_job::get(&state.db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("sync job".to_owned()))?;
  Ok(Json(job))
}

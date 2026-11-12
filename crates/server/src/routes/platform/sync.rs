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
    community, discover, distribution,
    import::{ImportMode, execute_import, resolve_import_source},
    job,
  },
  traits::{GlobalState, ResponseError},
};

/// One import request, in exactly one of two modes: direct (`endpoint` +
/// `token`) or community (`registry_url` + `bucket_id`). The community mode
/// never receives a token — the registry entry token is consumed server-side.
#[derive(Deserialize)]
pub(super) struct ImportRequest {
  endpoint: Option<String>,
  token: Option<String>,
  registry_url: Option<String>,
  bucket_id: Option<String>,
}

pub(super) async fn import_game(
  State(state): State<GlobalState>, Extension(operator): Extension<Token>,
  Extension(trace): Extension<RequestId>, headers: HeaderMap, Json(request): Json<ImportRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let mode = match (
    request.endpoint.as_deref(),
    request.token.as_deref(),
    request.registry_url.as_deref(),
    request.bucket_id.as_deref(),
  ) {
    (Some(endpoint), Some(token), None, None) => {
      let endpoint = discover::normalize_endpoint(endpoint)?;
      if token.trim().is_empty() {
        return Err(ResponseError::BadRequest(
          "source credential is required".to_owned(),
        ));
      }
      ImportMode::Direct {
        endpoint,
        credential: token.to_owned(),
      }
    }
    (None, None, Some(registry_url), Some(bucket_id)) => ImportMode::Community {
      registry_url: community::normalize_registry_url(registry_url)?,
      bucket_id: bucket_id.to_owned(),
    },
    _ => {
      return Err(ResponseError::BadRequest(
        "provide either endpoint + token (direct import) or registry_url + bucket_id \
         (community import), never both"
          .to_owned(),
      ));
    }
  };
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
    let resolution = match tokio::time::timeout(Duration::from_secs(600), async {
      let source = resolve_import_source(mode, &task_logger).await?;
      execute_import(
        state.clone(),
        source,
        operator.id,
        trace_id,
        task_logger.clone(),
      )
      .await
    })
    .await
    {
      Ok(outcome) => outcome,
      Err(_) => Err("Import timed out; partial data was cleaned up.".to_owned()),
    };
    if let Err(error) = resolution {
      task_logger.error(format!("Import failed: {error}")).await;
    }
  });
  let stream = AbortOnDropStream::new(ReceiverStream::new(rx), handle.abort_handle());
  Ok((
    StatusCode::OK,
    [("Content-Type", "text/plain; charset=utf-8")],
    Body::from_stream(stream),
  ))
}

#[derive(Deserialize)]
pub(super) struct RegistryIndexRequest {
  url: String,
}

/// Fetches a community registry index server-side and returns a sanitized
/// listing: entry tokens never leave the server.
pub(super) async fn list_registry_entries(
  State(_state): State<GlobalState>, Json(request): Json<RegistryIndexRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let url = community::normalize_registry_url(&request.url)?;
  let entries = community::list_entries(&url)
    .await
    .map_err(ResponseError::BadRequest)?;
  Ok(Json(entries))
}

pub(super) async fn list_distributions(
  State(state): State<GlobalState>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(distribution::list_distributions(&state).await?))
}

/// `Option<Option<i64>>` keeps `null` (clear the interval) distinct from a
/// missing field (keep the interval).
fn deserialize_double_option<'de, D>(deserializer: D) -> Result<Option<Option<i64>>, D::Error>
where
  D: serde::Deserializer<'de>, {
  Ok(Some(Option::<i64>::deserialize(deserializer)?))
}

#[derive(Deserialize)]
pub(super) struct PatchDistributionRequest {
  token: Option<String>,
  enabled: Option<bool>,
  #[serde(default, deserialize_with = "deserialize_double_option")]
  interval_seconds: Option<Option<i64>>,
}

pub(super) async fn patch_distribution(
  State(state): State<GlobalState>, Path(id): Path<i64>,
  Json(request): Json<PatchDistributionRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(
    distribution::patch_distribution(
      &state,
      id,
      request.token,
      request.enabled,
      request.interval_seconds,
    )
    .await?,
  ))
}

pub(super) async fn delete_distribution(
  State(state): State<GlobalState>, Path(id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  distribution::delete_distribution(&state, id).await?;
  Ok(())
}

pub(super) async fn unbind_distribution(
  State(state): State<GlobalState>, Path(id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(distribution::unbind_distribution(&state, id).await?))
}

#[derive(Deserialize)]
pub(super) struct BindDistributionRequest {
  local_game_id: i64,
}

pub(super) async fn bind_distribution(
  State(state): State<GlobalState>, Extension(operator): Extension<Token>, Path(id): Path<i64>,
  Json(request): Json<BindDistributionRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  Ok(Json(
    distribution::bind_distribution(&state, id, request.local_game_id, operator.id).await?,
  ))
}

pub(super) async fn trigger_sync_job(
  State(state): State<GlobalState>, Extension(trace): Extension<RequestId>, Path(id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  let job = job::enqueue_job(&state, id, sync_job::TRIGGER_MANUAL, Some(&trace)).await?;
  let runner_state = state.clone();
  let (distribution_id, job_id) = (job.distribution_id, job.id);
  tokio::spawn(async move {
    job::run_job(runner_state, distribution_id, job_id).await;
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
  if r2s_database::distribution::get(&state.db.conn, id)
    .await?
    .is_none()
  {
    return Err(ResponseError::NotFound("distribution".to_owned()));
  }
  let limit = query.limit.unwrap_or(50).min(200);
  let jobs = sync_job::get_list_by_distribution(&state.db.conn, id, limit).await?;
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

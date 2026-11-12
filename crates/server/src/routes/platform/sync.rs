use std::time::Duration;

use axum::{
  Extension, Json,
  body::{Body, Bytes},
  extract::State,
  http::{HeaderMap, StatusCode},
  response::IntoResponse,
};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::request_id::RequestId;

use super::super::game::{hook::GitHookFormatter, repo_sync::AbortOnDropStream};
use crate::{
  middleware::auth::Token,
  sync::import::{execute_import, normalize_repository_url},
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
        state,
        repository_url,
        request.token,
        operator.id,
        trace_id,
        task_logger.clone(),
      ),
    )
    .await
    {
      Ok(Ok(_)) => {}
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

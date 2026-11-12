use axum::{
  Extension,
  body::Body,
  extract::{Path, State},
  http::{HeaderMap, HeaderValue, StatusCode},
  response::IntoResponse,
};
use r2s_bucket::Bucket;
use r2s_database::{game, media as media_db};
use r2s_media::Media;
use r2s_migrator::Database;
use tokio_util::io::ReaderStream;

use crate::traits::ResponseError;

pub(super) async fn get_sync_media(
  State(db): State<Database>, State(media): State<Media>, State(bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Path(hash): Path<String>,
) -> Result<impl IntoResponse, ResponseError> {
  let game_bucket = bucket
    .at(
      game
        .bucket
        .as_deref()
        .ok_or_else(|| ResponseError::PreconditionFailed("game bucket not found".to_owned()))?,
    )
    .await?;
  let references = crate::sync::media::referenced_media_hashes(&game_bucket)
    .await
    .map_err(ResponseError::InternalServerError)?;
  if !references.contains(&hash) || media_db::get_by_hash(&db.conn, &hash).await?.is_none() {
    return Err(ResponseError::NotFound("media".to_owned()));
  }
  let file = media.get(&hash).await?;
  let stream = ReaderStream::new(file);
  let mut headers = HeaderMap::new();
  headers.insert(
    "Content-Type",
    media
      .get_mime_type(&hash)?
      .parse::<HeaderValue>()
      .map_err(|error| ResponseError::InternalServerError(error.to_string()))?,
  );
  headers.insert(
    "Content-Security-Policy",
    HeaderValue::from_static(
      "script-src 'none'; object-src 'none'; report-uri /cspreport; sandbox",
    ),
  );
  Ok((StatusCode::OK, headers, Body::from_stream(stream)))
}

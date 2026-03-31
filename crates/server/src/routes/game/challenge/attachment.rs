use axum::{
  Extension, Json,
  body::Body,
  extract::{Multipart, Query, State},
  http::{HeaderMap, StatusCode},
  response::{IntoResponse, Response},
};
use futures::TryStreamExt;
use r2s_bucket::{Bucket, challenge::ChallengeBucket};
use r2s_database::{challenge, game, team, user::Permission};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};
use tokio_util::io::{ReaderStream, StreamReader};
use tracing::{debug, info, warn};

use crate::{
  middleware::{
    auth::{Token, is_game_admin},
    data::extract_team,
  },
  traits::ResponseError,
};

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub(super) enum FileType {
  Static,
  Mapped,
  Checker,
}

#[derive(Deserialize)]
pub(super) struct FileRequest {
  pub folder: Option<FileType>,
  pub file: Option<String>,
  pub all: Option<bool>,
}

#[derive(Serialize)]
pub(super) struct FileResponse {
  pub folder: FileType,
  pub file: String,
}

pub(super) async fn get_player_attachment(
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>, Extension(token): Extension<Token>,
  team_ext: Extension<Option<team::Model>>, Query(query): Query<FileRequest>,
) -> Result<Response, ResponseError> {
  let team = extract_team!(game, team_ext, token);
  let challenge_bucket = super::get_challenge_bucket(bucket, &game, &challenge).await?;
  if !is_game_admin!(token, game)
    && (query.all == Some(true) || query.folder == Some(FileType::Checker))
  {
    warn!("user want to access checker files");
    return Err(ResponseError::Forbidden("permission denied".to_owned()));
  }
  if query.all == Some(true) && is_game_admin!(token, game) {
    let files = match query.folder {
      Some(FileType::Static) => challenge_bucket.get_static_files().await?,
      Some(FileType::Mapped) => challenge_bucket.get_mapped_files().await?,
      Some(FileType::Checker) => challenge_bucket.get_checker_files().await?,
      None => {
        return Err(ResponseError::BadRequest("folder is required".to_owned()));
      }
    };
    let files: Vec<FileResponse> = files
      .into_iter()
      .map(|file| FileResponse {
        folder: query.folder.clone().unwrap(),
        file,
      })
      .collect();
    debug!("admin query attachment files");
    return Ok(Json(files).into_response());
  }
  let files = get_files(
    &challenge_bucket,
    if let Some(team) = team {
      team.id
    } else {
      token.id
    },
  )
  .await?;

  if let (Some(folder), Some(file_name)) = (query.folder, query.file.clone()) {
    let checked_file = files
      .into_iter()
      .find(|f| f.folder == folder && f.file == file_name);
    if checked_file.is_none() && !is_game_admin!(token, game) {
      return Err(ResponseError::NotFound("file".to_string()));
    }
    let file = match folder {
      FileType::Static => challenge_bucket.download_static(&file_name).await?,
      FileType::Mapped => challenge_bucket.download_mapped(&file_name).await?,
      FileType::Checker => challenge_bucket.download_checker(&file_name).await?,
    };

    let mut header = HeaderMap::new();
    header.insert("Content-Length", file.metadata().await?.len().into());
    header.insert(
      "Content-Disposition",
      format!(r#"attachment; filename="{file_name}""#)
        .parse()
        .unwrap(),
    );
    header.insert("Content-Type", "application/octet-stream".parse().unwrap());
    let stream = ReaderStream::new(file);
    info!(file=%file_name, ?folder, "user downloaded attachment file");
    Ok((StatusCode::OK, header, Body::from_stream(stream)).into_response())
  } else {
    Ok(Json(files).into_response())
  }
}

async fn get_files(bucket: &ChallengeBucket, id: i64) -> Result<Vec<FileResponse>, ResponseError> {
  let static_files = bucket.get_static_files().await?;
  debug!(?static_files);

  let mapped_file = bucket.get_mapped_file(id).await?;
  let mut files: Vec<FileResponse> = static_files
    .into_iter()
    .map(|file| FileResponse {
      folder: FileType::Static,
      file,
    })
    .collect();
  if let Some(mapped_file) = mapped_file {
    files.push(FileResponse {
      folder: FileType::Mapped,
      file: mapped_file,
    });
  }
  Ok(files)
}

#[derive(Deserialize)]
pub(super) struct UploadChallengeAttachmentQuery {
  pub folder: FileType,
}

pub(super) async fn upload_challenge_attachment(
  State(ref db): State<Database>, State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Query(query): Query<UploadChallengeAttachmentQuery>, mut multipart: Multipart,
) -> Result<impl IntoResponse, ResponseError> {
  super::super::ensure_game_sync_writable(&db.conn, &game).await?;
  super::check_challenge_publishing(&challenge)?;
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(&bucket, &game, &challenge).await?;
  while let Some(field) = multipart
    .next_field()
    .await
    .map_err(|err| ResponseError::BadRequest(err.to_string()))?
  {
    let file_name = field
      .file_name()
      .ok_or(ResponseError::BadRequest(
        "file name is required".to_owned(),
      ))?
      .to_owned();
    let reader = StreamReader::new(field.map_err(std::io::Error::other));
    match query.folder {
      FileType::Static => challenge_bucket.upload_static(&file_name, reader).await?,
      FileType::Mapped => challenge_bucket.upload_mapped(&file_name, reader).await?,
      FileType::Checker => challenge_bucket.upload_checker(&file_name, reader).await?,
    }
    info!(file=%file_name, folder=?query.folder, "user uploaded attachment file");
  }
  game_bucket
    .commit(
      format!(":package: upload files for challenge {}", challenge.name),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  info!("user committed attachment files");

  Ok(())
}

pub(super) async fn delete_challenge_attachment(
  State(ref db): State<Database>, State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Query(query): Query<FileRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  super::super::ensure_game_sync_writable(&db.conn, &game).await?;
  super::check_challenge_publishing(&challenge)?;
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(&bucket, &game, &challenge).await?;
  let file = query
    .file
    .clone()
    .ok_or(ResponseError::BadRequest("file is required".to_owned()))?;
  match query.folder {
    Some(FileType::Static) => challenge_bucket.delete_static(&file).await?,
    Some(FileType::Mapped) => challenge_bucket.delete_mapped(&file).await?,
    Some(FileType::Checker) => challenge_bucket.delete_checker(&file).await?,
    None => {
      return Err(ResponseError::BadRequest("folder is required".to_owned()));
    }
  };
  game_bucket
    .commit(
      format!(
        ":fire: delete file {} for challenge {}",
        file, challenge.name
      ),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  Ok(())
}

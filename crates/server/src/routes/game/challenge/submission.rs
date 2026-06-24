use axum::{
  Extension, Json,
  extract::{Query, State},
  response::IntoResponse,
};
use chrono::Utc;
use r2s_cache::Cache;
use r2s_database::{
  challenge, game, submission, team,
  user::{self, Permission},
};
use r2s_event::{
  Event,
  events::{EventContainer, SubmissionEvent, SubmissionEventType},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use serde::{Deserialize, Serialize};
use tower_http::request_id::RequestId;
use tracing::{info, warn};

use crate::{
  middleware::{
    auth::{Token, is_game_admin},
    data::extract_team,
  },
  traits::ResponseError,
};

#[derive(Deserialize)]
pub(super) struct SolvesStatusQuery {
  pub id: Option<i64>,
}

#[derive(Serialize)]
pub(super) struct SolvesStatus {
  pub solved: bool,
  pub solves: u64,
}

pub(super) async fn get_challenge_solves_status(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, team_ext: Extension<Option<team::Model>>,
  Extension(challenge): Extension<challenge::Model>, Query(query): Query<SolvesStatusQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if let Some(id) = query.id {
    let submission = submission::get(&db.conn, id).await?;
    if let Some(submission) = submission.clone() {
      if submission.user_id != token.id || submission.challenge_id != challenge.id {
        return Err(ResponseError::NotFound("submission not found".to_owned()));
      }
      return Ok(Json(submission).into_response());
    }
    return Err(ResponseError::NotFound("submission not found".to_owned()));
  }
  let team = extract_team!(game, team_ext, token);
  let solves = submission::count(
    &db.conn,
    true,
    Some(challenge.game_id),
    Some(challenge.id),
    None,
    None,
    None,
    team.is_none(),
  )
  .await?;
  let solved = if let Some(team) = team {
    submission::count(
      &db.conn,
      true,
      Some(challenge.game_id),
      Some(challenge.id),
      Some(team.id),
      None,
      None,
      true,
    )
    .await?
      > 0
  } else {
    submission::count(
      &db.conn,
      true,
      Some(challenge.game_id),
      Some(challenge.id),
      None,
      Some(token.id),
      None,
      true,
    )
    .await?
      > 0
  };
  Ok(Json(SolvesStatus { solved, solves }).into_response())
}

#[derive(Deserialize)]
pub(super) struct SubmitRequest {
  pub content: String,
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn submit_flag(
  State(ref db): State<Database>, State(cache): State<Cache>, State(ref queue): State<Queue>,
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(trace): Extension<RequestId>, team_ext: Extension<Option<team::Model>>,
  Extension(challenge): Extension<challenge::Model>, Json(req): Json<SubmitRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = extract_team!(game, team_ext, token);
  let team = if team.is_some()
    && game.in_progress()
    && challenge.archive_at.is_none_or(|t| t > Utc::now())
  {
    team
  } else {
    None
  };
  let submission = submission::Model {
    id: 0,
    created_at: Utc::now(),
    challenge_id: challenge.id,
    content: Some(req.content.clone()),
    solved: None,
    result: None,
    is_llm_used: None,
    team_id: team.as_ref().map(|t| t.id),
    user_id: token.id,
  };

  if !is_game_admin!(token, game) {
    let limit: Option<i32> = cache.at("submission").get(token.id).await?;
    if limit.is_some_and(|v| v > 10) {
      warn!(
        "user {}:{} ({}) submission frequency limit exceeded",
        token.id, token.account, token.nickname
      );
      let event = EventContainer {
        game_id: game.id,
        event: Event::Submission(Box::new(SubmissionEvent {
          event_type: SubmissionEventType::TooQuick,
          submission: submission.clone(),
          operator: user::Model {
            id: token.id,
            nickname: token.nickname.clone(),
            account: token.account.clone(),
            ..Default::default()
          },
          team: team.clone(),
          peer_team: None,
          blood_state: None,
          reason: None,
          challenge: challenge.clone(),
        })),
      };
      queue
        .publish(
          "event",
          event,
          &trace.header_value().to_str().unwrap_or("UNKNOWN"),
        )
        .await
        .ok();
      warn!("player created too many submissions in a short time");
      return Err(ResponseError::TooManyRequests(
        "too many submissions, please calmdown and try again 5 miniutes later".to_owned(),
      ));
    }

    cache.at("submission").incr(token.id).await?;
    cache.at("submission").expire(token.id, 5 * 60).await?;
  }
  info!(content = ?req.content, "submit flag");
  let submission = submission::create(&db.conn, submission).await?;
  queue
    .publish(
      "check",
      submission.clone(),
      &trace.header_value().to_str().unwrap_or("UNKNOWN"),
    )
    .await?;
  Ok(Json(submission))
}

#[derive(Deserialize)]
pub(super) struct LabelSubmissionRequest {
  pub id: i64,
  pub is_llm_used: bool,
}

pub(super) async fn label_submission(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(challenge): Extension<challenge::Model>, Json(req): Json<LabelSubmissionRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let mut submission = submission::get(&db.conn, req.id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("submission not found".to_owned()))?;
  if submission.user_id != token.id || submission.challenge_id != challenge.id {
    return Err(ResponseError::NotFound("submission not found".to_owned()));
  }
  submission.is_llm_used = Some(req.is_llm_used);
  let result = submission::update(&db.conn, submission).await?;
  Ok(Json(result))
}

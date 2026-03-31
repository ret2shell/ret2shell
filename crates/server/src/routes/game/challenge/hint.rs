use axum::{
  Extension, Json,
  extract::{Query, State},
  response::IntoResponse,
};
use chrono::Utc;
use r2s_bucket::{
  Bucket,
  challenge::{ChallengeBucket, Hints},
};
use r2s_database::{challenge, extra, game, hint, team, user};
use r2s_event::{
  Event,
  events::{ChallengeEvent, ChallengeEventType, EventContainer},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use sea_orm::{DatabaseTransaction, TransactionTrait};
use serde::Deserialize;
use tower_http::request_id::RequestId;
use tracing::{info, warn};

use crate::{
  middleware::{auth::Token, data::extract_team},
  routes::game::worker,
  traits::ResponseError,
};

pub(super) async fn get_challenge_hints(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  team_ext: Extension<Option<team::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = extract_team!(game, team_ext, token);
  let hints = hint::get_list(&db.conn, challenge.id).await?;

  if let Some(team) = team {
    if game.start_at > Utc::now() || challenge.release_at.is_some_and(|t| t > Utc::now()) {
      return Ok(Json(Vec::new()));
    }
    if game.start_at < Utc::now() && !game.in_progress() {
      return Ok(Json(hints));
    }
    if game.archive_policy.challenge.show_hints
      && challenge.archive_at.is_some_and(|t| t < Utc::now())
    {
      return Ok(Json(hints));
    }

    let extras = extra::get_list(&db.conn, team.id).await?;
    let hints = hints
      .iter()
      .map(|h| {
        if h.cost > 0 && !extras.iter().any(|e| e.hint_id == Some(h.id)) {
          h.clone().desensitize()
        } else {
          h.clone()
        }
      })
      .collect();
    Ok(Json(hints))
  } else {
    Ok(Json(hints))
  }
}

#[derive(Deserialize)]
pub(super) struct UnlockHintRequest {
  pub id: i64,
}

pub(super) async fn unlock_hint(
  State(db): State<Database>, Extension(team): Extension<Option<team::Model>>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Json(req): Json<UnlockHintRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.in_progress() {
    warn!("user tried to unlock hint when the game is not in progress");
    return Err(ResponseError::Forbidden(
      "you cannot unlock hint when the game is not in progress".to_owned(),
    ));
  }
  if challenge.release_at.is_some_and(|t| t > Utc::now()) {
    warn!("user tried to unlock hint when the challenge is not released");
    return Err(ResponseError::Forbidden(
      "you cannot unlock hint when the challenge is not started".to_owned(),
    ));
  }
  if game.archive_policy.challenge.show_hints
    && challenge.archive_at.is_some_and(|t| t < Utc::now())
  {
    return Err(ResponseError::Conflict(
      "there's no need to unlock this hint".to_owned(),
    ));
  }

  let team = team.ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  let txn = db.conn.begin().await?;
  let hint = hint::get(&txn, req.id).await?;
  if let Some(hint) = hint {
    if hint.challenge_id != challenge.id {
      return Err(ResponseError::PreconditionFailed(
        "the hint does not belong to this challenge".to_owned(),
      ));
    }
    if hint.cost > team.score {
      return Err(ResponseError::PreconditionFailed(
        "you does not have enough score to unlock this hint".to_owned(),
      ));
    }
    if extra::get_list(&txn, team.id)
      .await?
      .iter()
      .any(|e| e.hint_id == Some(hint.id))
    {
      return Err(ResponseError::Conflict(
        "you have already unlocked this hint".to_owned(),
      ));
    }

    let extra = extra::create(
      &txn,
      extra::Model {
        created_at: Utc::now(),
        score: -hint.cost,
        team_id: team.id,
        challenge_id: Some(challenge.id),
        hint_id: Some(hint.id),
        reason: format!("Unlocked hint in challenge {}", challenge.name),
        ..Default::default()
      },
    )
    .await?;
    txn.commit().await?;
    info!(
      hint_id=%hint.id,
      cost=%hint.cost,
      "team unlocked hint",
    );
    tokio::spawn(async move {
      worker::game::update_team_state(&db, team).await.ok();
    });
    Ok(Json(extra))
  } else {
    Err(ResponseError::NotFound("hint".to_string()))
  }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn create_challenge_hint(
  State(bucket): State<Bucket>, State(ref db): State<Database>, State(ref queue): State<Queue>,
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(trace): Extension<RequestId>, Extension(challenge): Extension<challenge::Model>,
  Json(hint): Json<hint::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  super::super::ensure_game_sync_writable(&db.conn, &game).await?;
  let txn = db.conn.begin().await?;
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(&bucket, &game, &challenge).await?;

  let hint = hint::create(
    &txn,
    hint::Model {
      challenge_id: challenge.id,
      ..hint
    },
  )
  .await?;
  info!(
    hint_id=%hint.id,
    "new hint created",
  );
  let event = EventContainer {
    game_id: game.id,
    event: Event::Challenge(ChallengeEvent {
      event_type: ChallengeEventType::NewHint,
      challenge: challenge.clone(),
      operator: user::Model {
        id: token.id,
        nickname: token.nickname.clone(),
        account: token.account.clone(),
        ..Default::default()
      },
    }),
  };
  queue
    .publish(
      "event",
      event,
      &trace.header_value().to_str().unwrap_or("UNKNOWN"),
    )
    .await
    .ok();
  sync_challenge_hint_with_bucket(&challenge_bucket, &txn, &challenge).await?;
  txn.commit().await?;
  game_bucket
    .commit(
      format!(":speech_balloon: new hint for challenge {}", challenge.name),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  Ok(Json(hint))
}

#[derive(Deserialize)]
pub(super) struct DeleteHintQuery {
  pub id: i64,
}

pub(super) async fn delete_challenge_hint(
  State(bucket): State<Bucket>, State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Query(query): Query<DeleteHintQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  super::super::ensure_game_sync_writable(&db.conn, &game).await?;
  let txn = db.conn.begin().await?;
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(&bucket, &game, &challenge).await?;
  hint::delete(&txn, query.id).await?;
  sync_challenge_hint_with_bucket(&challenge_bucket, &txn, &challenge).await?;
  txn.commit().await?;
  game_bucket
    .commit(
      format!(":fire: delete hint for challenge {}", challenge.name),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  Ok(())
}

async fn sync_challenge_hint_with_bucket(
  bucket: &ChallengeBucket, db: &DatabaseTransaction, challenge: &challenge::Model,
) -> Result<(), ResponseError> {
  let hints = hint::get_list(db, challenge.id).await?;
  bucket
    .set_hints(Hints {
      hints: hints
        .into_iter()
        .map(|m| r2s_bucket::Hint {
          content: m.content,
          cost: m.cost,
        })
        .collect(),
    })
    .await?;
  Ok(())
}

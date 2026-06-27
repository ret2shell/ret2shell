use axum::{
  Extension, Json,
  extract::{Query, State},
  response::IntoResponse,
};
use chrono::Utc;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_checker::Checker;
use r2s_database::{
  challenge,
  game::{self, HostType},
  submission,
  user::{self, Permission},
};
use r2s_event::{
  Event,
  events::{ChallengeEvent, ChallengeEventType, EventContainer},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use sea_orm::TransactionTrait;
use serde::Deserialize;
use tower_http::request_id::RequestId;
use tracing::{info, warn};

use crate::{
  middleware::auth::{Token, is_game_admin},
  routes::game::lifecycle,
  traits::{GlobalState, ResponseError},
  utility::{
    pagination::{DEFAULT_PAGE_SIZE, DEFAULT_SUBMISSION_PAGE_SIZE, page, page_size},
    validation::validate_challenge_model,
  },
};

#[derive(Deserialize)]
pub(super) struct ChallengeQuery {
  page: Option<u64>,
  page_size: Option<u64>,
}

pub(super) async fn get_challenge_list(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Query(query): Query<ChallengeQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let is_admin = is_game_admin!(token, game);

  if game.start_at > Utc::now() && !is_admin {
    warn!("user tried to access challenges before game start");
    return Err(ResponseError::Forbidden("game has not started".to_owned()));
  }

  if query.page.is_none() || query.page_size.is_none() {
    let challenges = challenge::get_list(&db.conn, game.id, is_admin).await?;
    return Ok(Json((
      if is_admin {
        challenges
      } else {
        challenges
          .iter()
          .filter(|c| c.release_at.is_none_or(|t| t < Utc::now()))
          .cloned()
          .collect()
      },
      1,
    )));
  }
  let page = page(query.page);
  let page_size = page_size(query.page_size, DEFAULT_PAGE_SIZE);
  let result = challenge::get_page(&db.conn, page, page_size, game.id, is_admin).await?;
  Ok(Json((
    if is_admin {
      result.0
    } else {
      result
        .0
        .iter()
        .filter(|c| c.release_at.is_none_or(|t| t < Utc::now()))
        .cloned()
        .collect()
    },
    result.1,
  )))
}

pub(super) async fn get_challenge(
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if is_game_admin!(token, game) {
    return Ok(Json(challenge));
  }

  Ok(Json(challenge.desensitize()))
}

pub(super) async fn create_challenge(
  State(ref db): State<Database>, State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Json(challenge): Json<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  validate_challenge_model(&challenge)?;
  let txn = db.conn.begin().await?;
  let game_bucket = bucket
    .at_mut(
      game
        .bucket
        .ok_or(ResponseError::PreconditionFailed(format!(
          "game {}:{} does not have a valid bucket",
          game.id, game.name
        )))?,
    )
    .await?;
  let challenge_bucket = game_bucket
    .create(serde_json::to_value(&challenge)?)
    .await?;
  challenge_bucket
    .set_description(challenge.content.clone().unwrap_or_default())
    .await?;
  let challenge = challenge::create(
    &txn,
    challenge::Model {
      game_id: game.id,
      hidden: true,
      bucket: Some(challenge_bucket.name),
      ..challenge
    },
  )
  .await?;
  game_bucket
    .commit(
      format!(":sparkles: create challenge {}", challenge.name),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  txn.commit().await?;

  Ok(Json(challenge))
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn update_challenge(
  State(ref db): State<Database>, State(cache): State<Cache>, State(bucket): State<Bucket>,
  State(ref queue): State<Queue>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(prev_challenge): Extension<challenge::Model>,
  Extension(trace): Extension<RequestId>, Json(challenge): Json<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  validate_challenge_model(&challenge)?;
  super::check_challenge_publishing(&prev_challenge)?;
  let txn = db.conn.begin().await?;
  let score_changed = prev_challenge.score_rule != challenge.score_rule;
  let challenge = challenge::update(
    &txn,
    challenge::Model {
      hidden: prev_challenge.hidden,
      ..challenge
    },
  )
  .await?;
  let challenge = if score_changed {
    let (actually_changed, _, challenge) =
      challenge::maintain_score(&txn, challenge.clone()).await?;
    if actually_changed {
      info!(
        previous_score=%prev_challenge.score,
        new_score=%challenge.score,
        "challenge score changed, will trigger scoreboard update",
      );
    }
    challenge
  } else {
    challenge
  };

  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(&bucket, &game, &challenge).await?;
  challenge_bucket
    .set_config(serde_json::to_value(&challenge)?)
    .await?;
  challenge_bucket
    .set_description(challenge.content.clone().unwrap_or_default())
    .await?;
  game_bucket
    .commit(
      format!(
        ":building_construction: update challenge config {}",
        challenge.name
      ),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  txn.commit().await?;
  if score_changed {
    queue
      .publish(
        "scoreboard",
        challenge.clone(),
        &trace.header_value().to_str().unwrap_or("UNKNOWN"),
      )
      .await
      .ok();
  }
  cache.at("challenge").del(challenge.id).await.ok();

  Ok(Json(challenge))
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn up_challenge(
  State(ref db): State<Database>, State(cache): State<Cache>, State(bucket): State<Bucket>,
  State(ref queue): State<Queue>, State(checker): State<Checker>,
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(trace): Extension<RequestId>, Extension(challenge): Extension<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let challenge_bucket = super::get_challenge_bucket(&bucket, &game, &challenge).await?;
  let challenge = challenge::update(
    &txn,
    challenge::Model {
      hidden: false,
      ..challenge
    },
  )
  .await?;
  checker.lint(&challenge_bucket).await?;
  txn.commit().await?;
  info!("challenge is maken public (up) by user");

  cache.at("challenge").del(challenge.id).await.ok();
  let event = EventContainer {
    game_id: challenge.game_id,
    event: Event::Challenge(ChallengeEvent {
      event_type: ChallengeEventType::Up,
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
  Ok(Json(challenge))
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn down_challenge(
  State(state): State<GlobalState>, State(ref db): State<Database>, State(cache): State<Cache>,
  State(ref queue): State<Queue>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Extension(trace): Extension<RequestId>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let challenge = challenge::update(
    &txn,
    challenge::Model {
      hidden: true,
      ..challenge.clone()
    },
  )
  .await?;
  txn.commit().await?;
  info!("challenge is maken invisible (down) by user");

  lifecycle::spawn_challenge_stop(
    state.clone(),
    game.clone(),
    challenge.clone(),
    trace
      .header_value()
      .to_str()
      .unwrap_or("UNKNOWN")
      .to_owned(),
  );

  cache.at("challenge").del(challenge.id).await.ok();
  let event = EventContainer {
    game_id: challenge.game_id,
    event: Event::Challenge(ChallengeEvent {
      event_type: ChallengeEventType::Down,
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
  Ok(Json(challenge))
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn delete_challenge(
  State(state): State<GlobalState>, State(ref db): State<Database>, State(cache): State<Cache>,
  State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Extension(trace): Extension<RequestId>,
) -> Result<impl IntoResponse, ResponseError> {
  lifecycle::spawn_challenge_stop(
    state.clone(),
    game.clone(),
    challenge.clone(),
    trace
      .header_value()
      .to_str()
      .unwrap_or("UNKNOWN")
      .to_owned(),
  );

  let txn = db.conn.begin().await?;
  challenge::delete(&txn, challenge.id).await?;
  let game_bucket = bucket
    .at_mut(
      game
        .bucket
        .ok_or(ResponseError::PreconditionFailed(format!(
          "game {}:{} does not have a valid bucket",
          game.id, game.name
        )))?,
    )
    .await?;
  game_bucket
    .delete(
      &challenge
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(format!(
          "challenge {}:{} in game {}:{} does not have a valid bucket",
          game.id, game.name, challenge.id, challenge.name
        )))?,
    )
    .await?;
  game_bucket
    .commit(
      format!(":fire: delete challenge {}", challenge.name),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  txn.commit().await?;
  cache.at("challenge").del(challenge.id).await.ok();

  Ok(())
}

pub(super) async fn get_challenge_update_history(
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let game_bucket = bucket
    .at(
      game
        .bucket
        .as_ref()
        .ok_or(ResponseError::PreconditionFailed(
          "game does not have a valid bucket".to_owned(),
        ))?,
    )
    .await?;
  let history = game_bucket
    .logs(
      challenge
        .bucket
        .as_ref()
        .ok_or(ResponseError::PreconditionFailed(
          "challenge does not have a valid bucket".to_owned(),
        ))?,
    )
    .await?;
  Ok(Json(history))
}

#[derive(Deserialize)]
pub(super) struct ChallengeSubmissionsQuery {
  pub page: Option<u64>,
  pub page_size: Option<u64>,
  pub only_solved: Option<bool>,
}

pub(super) async fn get_challenge_submissions(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>,
  Query(query): Query<ChallengeSubmissionsQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let solves = submission::get_page_ex(
    &db.conn,
    page(query.page),
    page_size(query.page_size, DEFAULT_SUBMISSION_PAGE_SIZE),
    query.only_solved.unwrap_or(false),
    true,
    Some(game.id),
    Some(challenge.id),
    None,
    None,
  )
  .await?;
  Ok(Json(solves))
}

pub(super) async fn get_answer(
  State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let not_archived_or_hide_after_archiving = if challenge.archive_at.is_some_and(|t| t < Utc::now())
  {
    !game.archive_policy.challenge.show_answer
  } else {
    true
  };
  if game.host_type == HostType::Game
    && !game.archived()
    && !is_game_admin!(token, game)
    && not_archived_or_hide_after_archiving
  {
    warn!("user tried to get answer when the game is not archived");
    return Err(ResponseError::Forbidden(format!(
      "you can only get the answer after the {} is archived",
      if game.archive_policy.challenge.show_answer {
        "game or challenge"
      } else {
        "game"
      }
    )));
  }
  let challenge_bucket = super::get_challenge_bucket(&bucket, &game, &challenge).await?;

  Ok(Json(challenge_bucket.answer().await?))
}

pub(super) async fn update_answer(
  State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Json(answer): Json<String>,
) -> Result<impl IntoResponse, ResponseError> {
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(&bucket, &game, &challenge).await?;
  challenge_bucket.set_answer(answer.clone()).await?;
  info!("challenge answer updated");
  game_bucket
    .commit(
      format!(":fire: update answer for challenge {}", challenge.name),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  Ok(Json(answer))
}

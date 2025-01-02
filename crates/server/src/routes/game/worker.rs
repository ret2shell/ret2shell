use chrono::Utc;
use futures::StreamExt;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_checker::Checker;
use r2s_cluster::Cluster;
use r2s_database::{
  audit, challenge, extra, game, submission,
  team::{self, TeamScoreHistory, TeamScoreHistoryList},
  user,
};
use r2s_event::{
  events::{EventContainer, SubmissionEvent, SubmissionEventType},
  Event,
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use sea_orm::TransactionTrait;
use tracing::{error, info, warn};

use crate::traits::{GlobalState, ResponseError};

pub async fn spawn_game_workers(state: GlobalState) {
  let queue = state.queue.clone();
  let database = state.db.clone();
  let checker = state.checker.clone();
  let bucket = state.bucket.clone();
  let cache = state.cache.clone();
  let cluster = state.cluster.clone();
  tokio::spawn(submission_worker(
    queue.clone(),
    database.clone(),
    cache,
    checker,
    bucket,
    cluster,
  ));
  tokio::spawn(score_maintenance_worker(queue, database));
}

async fn score_maintenance_worker(queue: Queue, db: Database) {
  info!("Score maintenance worker started");
  let messages = queue
    .subscribe("scoreboard")
    .await
    .inspect_err(|err| {
      error!("Failed to subscribe to submission-check queue: {:?}", err);
    })
    .ok();
  let mut messages = if let Some(messages) = messages {
    messages
  } else {
    return;
  };
  while let Some(message) = messages.next().await {
    if let Ok(message) = message {
      let req = String::from_utf8(message.message.payload.to_vec())
        .inspect_err(|e| {
          error!("Failed to parse message from nats: {:?}", e);
        })
        .ok();
      if req.is_none() {
        message.ack().await.ok();
        continue;
      }
      let challenge = serde_json::from_str::<challenge::Model>(&req.unwrap())
        .inspect_err(|e| {
          error!("Failed to parse message from nats: {:?}", e);
        })
        .ok();
      if challenge.is_none() {
        message.ack().await.ok();
        continue;
      }
      let challenge = challenge.unwrap();
      score_maintenance_worker_exec(db.clone(), challenge.clone())
        .await
        .inspect_err(|e| error!("Failed to process message: {:?}", e))
        .ok();
      message.ack().await.ok();
    }
  }
}

async fn score_maintenance_worker_exec(
  db: Database, challenge: challenge::Model,
) -> Result<(), ResponseError> {
  let txn = db.conn.begin().await?;
  let submissions = submission::get_list(
    &txn,
    true,
    false,
    Some(challenge.game_id),
    Some(challenge.id),
    None,
    None,
    true,
  )
  .await?;
  for submission in submissions {
    let team_id = submission.team_id.unwrap();
    let team = team::get(&txn, team_id).await?;
    let team = if let Some(team) = team {
      team
    } else {
      continue;
    };
    let score = team::calc_score(&txn, team.id).await?;
    let mut history = team.history.0.clone();
    let changed_at = Utc::now();
    if history.last().map(|h| h.changed_at.timestamp()) != Some(changed_at.timestamp()) {
      history.push(TeamScoreHistory {
        changed_at,
        blood_state: None,
        challenge_id: None,
        score,
      });
    }
    team::update(
      &txn,
      team::Model {
        id: team.id,
        score,
        history: TeamScoreHistoryList(history),
        ..team
      },
    )
    .await?;
  }
  txn.commit().await?;
  Ok(())
}

async fn submission_worker(
  queue: Queue, db: Database, cache: Cache, checker: Checker, bucket: Bucket, cluster: Cluster,
) {
  let messages = queue
    .subscribe("check")
    .await
    .inspect_err(|err| {
      error!("Failed to subscribe to submission-check queue: {:?}", err);
    })
    .ok();
  let mut messages = if let Some(messages) = messages {
    messages
  } else {
    return;
  };
  while let Some(message) = messages.next().await {
    if let Ok(message) = message {
      let req = String::from_utf8(message.message.payload.to_vec())
        .inspect_err(|e| {
          error!("Failed to parse message from nats: {:?}", e);
        })
        .ok();
      if req.is_none() {
        message.ack().await.ok();
        continue;
      }
      let submission = serde_json::from_str::<submission::Model>(&req.unwrap())
        .inspect_err(|e| {
          error!("Failed to parse message from nats: {:?}", e);
        })
        .ok();
      if submission.is_none() {
        message.ack().await.ok();
        continue;
      }
      let result = submission_worker_exec(
        queue.clone(),
        db.clone(),
        cache.clone(),
        checker.clone(),
        bucket.clone(),
        cluster.clone(),
        submission.clone().unwrap(),
      )
      .await
      .inspect_err(|e| error!("Failed to process message: {:?}", e))
      .ok();
      if result.is_none() {
        submission::update(
          &db.conn,
          submission::Model {
            id: submission.clone().unwrap().id,
            solved: Some(false),
            result: Some("checker fails on your input, incorrect.".to_owned()),
            ..submission.unwrap()
          },
        )
        .await
        .ok();
        message.ack().await.ok();
        continue;
      }
      message.ack().await.ok();
    } else {
      error!("Failed to receive message from nats: {:?}", message);
    }
  }
}

fn get_award_rate(game: &game::Model, blood_state: i32) -> i32 {
  if let Some(award_rates) = game.award_rates.clone() {
    if blood_state < award_rates.0.len() as i32 {
      return award_rates.0[blood_state as usize];
    }
    return 0;
  } else if blood_state <= 3 && game.award_rate > 0 {
    return game.award_rate * (4 - blood_state) / 3;
  }
  0
}

async fn submission_worker_exec(
  queue: Queue, db: Database, cache: Cache, mut checker: Checker, bucket: Bucket, cluster: Cluster,
  submission: submission::Model,
) -> Result<submission::Model, ResponseError> {
  // stage 1: get all necessary data
  let txn = db.conn.begin().await?;
  let challenge = challenge::get(&txn, submission.challenge_id).await?;
  let challenge = if let Some(challenge) = challenge {
    challenge
  } else {
    return Err(ResponseError::BadRequest("challenge not found".to_owned()));
  };
  let team = if let Some(team_id) = submission.team_id {
    team::get(&txn, team_id).await?
  } else {
    None
  };
  let user = user::get(&txn, submission.user_id).await?;
  let game = game::get(&txn, challenge.game_id).await?;
  let game = if let Some(game) = game {
    game
  } else {
    return Err(ResponseError::BadRequest("game not found".to_owned()));
  };
  let user = if let Some(user) = user {
    user
  } else {
    return Err(ResponseError::BadRequest("user not found".to_owned()));
  };
  let challenge_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(format!(
          "game {}:'{}' does not have a valid bucket",
          game.id, game.name
        )))?,
    )
    .await?
    .at(
      challenge
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(format!(
          "challenge {}:'{}' in game {}:'{}' does not have a valid bucket",
          challenge.id, challenge.name, game.id, game.name
        )))?,
    )
    .await?;

  // stage 2: invoke checker to check the submission
  checker.preload(&challenge, &challenge_bucket).await?;
  let (solved, result, audit) = checker
    .check(&challenge_bucket, &user, &team, &submission)
    .await?;
  let submission = submission::update(
    &txn,
    submission::Model {
      id: submission.id,
      solved: Some(solved),
      result: Some(result),
      ..submission
    },
  )
  .await?;

  if team.is_none() {
    txn.commit().await?;
    return Ok(submission);
  }

  let team = team.unwrap();

  // stage 3: update team score and create extra or audit if necessary
  if submission.solved.unwrap_or(false) {
    info!(
      "Submission {}:'{:?}' by {}:'{}' ({}) for challenge {}:{} in game {}:{} is correct",
      submission.id,
      submission.content,
      user.id,
      user.account,
      user.nickname,
      challenge.id,
      challenge.name,
      game.id,
      game.name
    );
    tokio::spawn(async move {
      cluster
        .at("ret2shell-challenge")
        .stop_challenge_env(user.id)
        .await
        .ok();
    });
    // stage 3.1: update challenge score
    let (changed, decay, challenge) = challenge::maintain_score(&txn, challenge.clone()).await?;

    // detect blood state and create extra if necessary
    let blood_state = if decay <= 3 { Some(decay as i32) } else { None };
    let changed_at = submission.created_at;
    let mut team = team.clone();
    if let Some(blood_state) = blood_state {
      let score = challenge.score_rule.initial * get_award_rate(&game, blood_state) / 100;
      if score > 0 {
        extra::create(
          &txn,
          extra::Model {
            id: 0,
            created_at: changed_at,
            team_id: team.id,
            challenge_id: Some(challenge.id),
            score,
            reason: format!(
              "No.{blood_state} solution for challenge {}#{}",
              challenge.id, challenge.name
            ),
            hint_id: None,
          },
        )
        .await?;
      }
    }
    // stage 3.2: update team score
    let score = team::calc_score(&txn, team.id).await?;
    team.score = score;
    team.history.0.push(TeamScoreHistory {
      changed_at,
      blood_state,
      challenge_id: Some(challenge.id),
      score,
    });
    team.last_active_at = changed_at;
    team::update(&txn, team.clone()).await?;

    // stage 3.3: create team correct event
    let event = EventContainer {
      game_id: challenge.game_id,
      event: Event::Submission(Box::new(SubmissionEvent {
        event_type: SubmissionEventType::Correct,
        submission: submission.clone(),
        blood_state,
        challenge: challenge.clone(),
        operator: user.clone(),
        team: Some(team.clone()),
        peer_team: None,
        reason: None,
      })),
    };
    txn.commit().await?;
    queue.publish("event", event).await.ok(); // publish scoreboard update event if necessary
    if changed {
      queue.publish("scoreboard", challenge.clone()).await.ok();
      cache.at("challenge").del(challenge.id).await.ok();
    }
  } else {
    info!(
      "Submission {}:'{:?}' by {}:'{}' ({}) for challenge {}:{} in game {}:{} is incorrect",
      submission.id,
      submission.content,
      user.id,
      user.account,
      user.nickname,
      challenge.id,
      challenge.name,
      game.id,
      game.name
    );
    txn.commit().await?;
  }

  let txn = db.conn.begin().await?;
  // stage 4: create audit if necessary
  if let Some(audit) = audit {
    let peer_team = if audit.peer_team != 0 {
      let peer_team = team::get(&txn, audit.peer_team).await?;
      // could not find peer team, this audit is a mistake, ignore it
      if peer_team.is_none() {
        txn.commit().await?;
        return Ok(submission);
      }
      peer_team
    } else {
      None
    };
    let audit = audit::Model {
      id: 0,
      created_at: Utc::now(),
      reason: audit.reason,
      challenge_id: challenge.id,
      user_id: user.id,
      team_id: team.id,
      game_id: game.id,
      state: audit::State::Pending,
    };
    let audit = audit::create(&txn, audit).await?;
    warn!(
      "Audit {} for submission {} by {}:{} ({}) for challenge {}:{} in game {}:{}",
      audit.id,
      submission.id,
      user.id,
      user.account,
      user.nickname,
      challenge.id,
      challenge.name,
      game.id,
      game.name
    );
    let event = EventContainer {
      game_id: challenge.game_id,
      event: Event::Submission(Box::new(SubmissionEvent {
        event_type: SubmissionEventType::Cheated,
        submission: submission.clone(),
        blood_state: None,
        challenge: challenge.clone(),
        operator: user.clone(),
        team: Some(team.clone()),
        peer_team,
        reason: Some(audit.reason),
      })),
    };
    queue.publish("event", event).await.ok();
  }

  txn.commit().await?;
  Ok(submission)
}

pub async fn update_team_state(db: &Database, team: team::Model) -> Result<(), ResponseError> {
  let txn = db.conn.begin().await?;
  let score = team::calc_score(&txn, team.id).await;
  if let Err(err) = score {
    warn!("calc team score failed: {:?}", err);
    return Err(ResponseError::DatabaseError(err));
  }
  let score = score.unwrap();
  if score != team.score {
    let mut team_history = team.history.clone().0;
    team_history.push(team::TeamScoreHistory {
      score,
      challenge_id: None,
      changed_at: Utc::now(),
      blood_state: None,
    });
    let result = team::update(
      &txn,
      team::Model {
        id: team.id,
        score,
        history: team::TeamScoreHistoryList(team_history),
        ..team
      },
    )
    .await;
    if let Err(e) = result {
      warn!("update team score failed: {:?}", e);
    }
  }
  txn.commit().await?;
  Ok(())
}

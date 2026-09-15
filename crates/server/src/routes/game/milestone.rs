use std::collections::BTreeMap;

use axum::{
  Extension, Json, Router,
  extract::State,
  middleware,
  response::IntoResponse,
  routing::{delete, get, patch, post},
};
use r2s_bucket::{
  Bucket,
  game::{Milestone, Milestones},
};
use r2s_database::{challenge, challenge_milestone, game, team, user::Permission};
use r2s_migrator::Database;
use sea_orm::{DatabaseTransaction, TransactionTrait};

use crate::{
  middleware::{
    auth::{self, Token},
    data,
  },
  traits::{GlobalState, ResponseError},
  utility::validation::validate_challenge_milestone_model,
  worker,
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .nest(
      "/{challenge_milestone}",
      Router::new()
        .route("/", patch(update_milestone).delete(delete_milestone))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(challenge_milestone, false, id, name),
        )),
    )
    .route("/all", delete(delete_milestones))
    .route("/", post(create_milestone))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      auth::game_admin_required,
    ))
    .route("/", get(get_milestones))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      auth::game_access_required,
    ))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Basic,
      Permission::Verified
    )))
}

pub(super) async fn get_milestones(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let milestones = challenge_milestone::get_list(&db.conn, game.id).await?;
  Ok(Json(milestones))
}

pub(super) async fn create_milestone(
  State(ref db): State<Database>, State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Json(milestone): Json<challenge_milestone::Model>,
) -> Result<impl IntoResponse, crate::traits::ResponseError> {
  validate_challenge_milestone_model(&milestone)?;
  let txn = db.conn.begin().await?;
  super::challenge::resolve_prerequisite_models(&txn, game.id, None, &milestone.prerequisites)
    .await?;
  ensure_name_available(&txn, game.id, None, &milestone.name).await?;
  let milestone = challenge_milestone::create(
    &txn,
    challenge_milestone::Model {
      id: 0,
      created_at: chrono::Utc::now(),
      updated_at: chrono::Utc::now(),
      game_id: game.id,
      ..milestone
    },
  )
  .await?;
  write_milestones_to_bucket(
    &txn,
    &bucket,
    &game,
    &token,
    format!(":sparkles: create milestone {}", milestone.name),
  )
  .await?;
  txn.commit().await?;
  recalculate_team_scores(db.clone(), game).await;
  Ok(Json(milestone))
}

/// Rejects the request when the milestone belongs to another game than the one
/// addressed by the URL, mirroring the cross-game guard on challenge routes.
fn ensure_milestone_in_game(
  game: &game::Model, milestone: &challenge_milestone::Model,
) -> Result<(), ResponseError> {
  if milestone.game_id != game.id {
    tracing::warn!(
      milestone_id = milestone.id,
      milestone_game_id = milestone.game_id,
      game_id = game.id,
      "user wants to access cross-game milestone"
    );
    return Err(ResponseError::Forbidden("permission denied".to_owned()));
  }
  Ok(())
}

pub(super) async fn update_milestone(
  State(ref db): State<Database>, State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>,
  Extension(prev_milestone): Extension<challenge_milestone::Model>,
  Json(milestone): Json<challenge_milestone::Model>,
) -> Result<impl IntoResponse, crate::traits::ResponseError> {
  ensure_milestone_in_game(&game, &prev_milestone)?;
  validate_challenge_milestone_model(&milestone)?;
  let txn = db.conn.begin().await?;
  super::challenge::resolve_prerequisite_models(
    &txn,
    game.id,
    Some(prev_milestone.id),
    &milestone.prerequisites,
  )
  .await?;
  ensure_name_available(&txn, game.id, Some(prev_milestone.id), &milestone.name).await?;
  let milestone = challenge_milestone::update(
    &txn,
    challenge_milestone::Model {
      id: prev_milestone.id,
      created_at: prev_milestone.created_at,
      game_id: prev_milestone.game_id,
      ..milestone
    },
  )
  .await?;
  write_milestones_to_bucket(
    &txn,
    &bucket,
    &game,
    &token,
    format!(":recycle: update milestone {}", milestone.name),
  )
  .await?;
  txn.commit().await?;
  recalculate_team_scores(db.clone(), game).await;
  Ok(Json(milestone))
}

pub(super) async fn delete_milestone(
  State(ref db): State<Database>, State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>,
  Extension(milestone): Extension<challenge_milestone::Model>,
) -> Result<impl IntoResponse, crate::traits::ResponseError> {
  ensure_milestone_in_game(&game, &milestone)?;
  let txn = db.conn.begin().await?;
  challenge_milestone::delete(&txn, milestone.id).await?;
  write_milestones_to_bucket(
    &txn,
    &bucket,
    &game,
    &token,
    format!(":fire: delete milestone {}", milestone.name),
  )
  .await?;
  txn.commit().await?;
  recalculate_team_scores(db.clone(), game).await;
  Ok(())
}

/// Removes every milestone of the game.
pub(super) async fn delete_milestones(
  State(ref db): State<Database>, State(bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, crate::traits::ResponseError> {
  let txn = db.conn.begin().await?;
  challenge_milestone::delete_by_game_id(&txn, game.id).await?;
  write_milestones_to_bucket(
    &txn,
    &bucket,
    &game,
    &token,
    ":fire: delete all milestones".to_owned(),
  )
  .await?;
  txn.commit().await?;
  recalculate_team_scores(db.clone(), game).await;
  Ok(())
}

async fn ensure_name_available(
  txn: &DatabaseTransaction, game_id: i64, exclude_id: Option<i64>, name: &str,
) -> Result<(), crate::traits::ResponseError> {
  let taken = challenge_milestone::get_list(txn, game_id)
    .await?
    .iter()
    .any(|m| Some(m.id) != exclude_id && m.name == name);
  if taken {
    return Err(crate::traits::ResponseError::Conflict(format!(
      "milestone {name} already exists in this game"
    )));
  }
  Ok(())
}

/// Mirrors the milestones of the game into the `milestones.toml` of the game
/// bucket. Prerequisites are stored as challenge bucket names because
/// challenge ids are not persistent across databases.
async fn write_milestones_to_bucket(
  txn: &DatabaseTransaction, bucket: &Bucket, game: &game::Model, token: &Token, message: String,
) -> Result<(), crate::traits::ResponseError> {
  let milestones = challenge_milestone::get_list(txn, game.id).await?;
  let challenges = challenge::get_full_list(txn, game.id).await?;
  let bucket_names: BTreeMap<i64, String> = challenges
    .iter()
    .filter_map(|c| c.bucket.clone().map(|bucket| (c.id, bucket)))
    .collect();

  let mut bucket_milestones = Vec::with_capacity(milestones.len());
  for milestone in &milestones {
    let mut prerequisites = Vec::with_capacity(milestone.prerequisites.0.len());
    for &id in &milestone.prerequisites.0 {
      let bucket = bucket_names.get(&id).ok_or_else(|| {
        ResponseError::InternalServerError(format!(
          "milestone {}:{} references challenge {id} without a bucket",
          milestone.id, milestone.name
        ))
      })?;
      prerequisites.push(bucket.clone());
    }
    bucket_milestones.push(Milestone {
      name: milestone.name.clone(),
      description: milestone.description.clone(),
      avatar: milestone.avatar.clone(),
      bonus_score: milestone.bonus_score,
      prerequisites,
    });
  }

  let game_bucket = super::get_game_bucket_mut(bucket, game).await?;
  game_bucket
    .set_milestones(Milestones {
      milestones: bucket_milestones,
    })
    .await?;
  game_bucket
    .commit(
      message,
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  Ok(())
}

/// Milestone changes may satisfy or unsatisfy milestones for any team of the
/// game, so every team score is recalculated. The score and history storage
/// stay untouched: `update_team_state` only appends a history entry when the
/// total actually changed.
async fn recalculate_team_scores(db: Database, game: game::Model) {
  tokio::spawn(async move {
    for team in team::get_list_by_game_id(&db.conn, game.id)
      .await
      .unwrap_or_default()
    {
      worker::game::update_team_state(&db, team).await.ok();
    }
  });
}

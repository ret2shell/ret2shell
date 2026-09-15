use std::collections::BTreeMap;

use axum::{
  Router,
  extract::DefaultBodyLimit,
  middleware,
  routing::{get, patch, post},
};
use r2s_bucket::{
  Bucket,
  challenge::{ChallengeBucket, ChallengeConfig},
  game::GameBucket,
};
use r2s_database::{challenge, challenge_milestone, game, user::Permission};
use sea_orm::ConnectionTrait;

use crate::{
  middleware::{
    auth,
    data::{self},
  },
  traits::{GlobalState, ResponseError},
  utility::prerequisites::find_cycle,
};

mod attachment;
mod checker;
mod hint;
mod instance;
mod resource;
mod submission;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .route("/", post(resource::create_challenge))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      auth::game_admin_required,
    ))
    .route("/", get(resource::get_challenge_list))
    .nest(
      "/{challenge}",
      Router::new()
        .nest(
          "/file",
          Router::new()
            .route(
              "/",
              post(attachment::upload_challenge_attachment)
                .delete(attachment::delete_challenge_attachment),
            )
            .route_layer(DefaultBodyLimit::max(1024 * 1024 * 1024)),
        )
        .route("/history", get(resource::get_challenge_update_history))
        .route(
          "/env",
          patch(instance::update_challenge_env_config)
            .delete(instance::delete_challenge_env_config),
        )
        .route(
          "/instance",
          get(instance::get_all_running_instances_for_challenge),
        )
        .route("/submission", get(resource::get_challenge_submissions))
        .route(
          "/checker",
          get(checker::get_checker_script).patch(checker::update_checker_script),
        )
        .route(
          "/hint",
          post(hint::create_challenge_hint).delete(hint::delete_challenge_hint),
        )
        .route("/answer", patch(resource::update_answer))
        .route(
          "/",
          patch(resource::update_challenge).delete(resource::delete_challenge),
        )
        .route(
          "/publish",
          post(resource::up_challenge).delete(resource::down_challenge),
        )
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          auth::game_admin_required,
        ))
        .route("/answer", get(resource::get_answer))
        .route("/file", get(attachment::get_player_attachment))
        .route("/env", get(instance::get_challenge_env_config))
        .route(
          "/instance",
          post(instance::start_challenge_instance)
            .patch(instance::delay_challenge_instance)
            .delete(instance::stop_challenge_instance),
        )
        .route("/hint", get(hint::get_challenge_hints))
        .route("/hint/unlock", post(hint::unlock_hint))
        .route(
          "/submit",
          get(submission::get_challenge_solves_status).post(submission::submit_flag),
        )
        .route("/", get(resource::get_challenge))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          auth::challenge_access_required,
        ))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(challenge, true, id, name),
        )),
    )
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      auth::game_access_required,
    ))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Basic,
      Permission::Verified
    )))
}

pub(super) async fn get_challenge_bucket(
  bucket: &Bucket, game: &game::Model, challenge: &challenge::Model,
) -> Result<ChallengeBucket, ResponseError> {
  bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(format!(
          "game {}:{} does not have a valid bucket",
          game.id, game.name
        )))?,
    )
    .await?
    .at(
      challenge
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(format!(
          "challenge {}:{} in game {}:{} does not have a valid bucket",
          challenge.id, challenge.name, game.id, game.name
        )))?,
    )
    .await
    .map_err(Into::into)
}

pub(super) async fn get_challenge_bucket_mut(
  bucket: &Bucket, game: &game::Model, challenge: &challenge::Model,
) -> Result<(GameBucket, ChallengeBucket), ResponseError> {
  let game_bucket = bucket
    .at_mut(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(format!(
          "game {}:{} does not have a valid bucket",
          game.id, game.name
        )))?,
    )
    .await?;
  let challenge_bucket = game_bucket
    .at(
      challenge
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(format!(
          "challenge {}:{} in game {}:{} does not have a valid bucket",
          challenge.id, challenge.name, game.id, game.name
        )))?,
    )
    .await?;
  Ok((game_bucket, challenge_bucket))
}

pub(super) fn check_challenge_publishing(prev: &challenge::Model) -> Result<(), ResponseError> {
  if !prev.hidden {
    return Err(ResponseError::PreconditionFailed(
      "please hidden challenge before update it".to_owned(),
    ));
  }
  Ok(())
}

/// Loads the models of the challenges referenced by `prerequisites` and
/// validates that every reference exists, belongs to the same game and is not
/// the challenge itself.
pub(super) async fn resolve_prerequisite_models<C>(
  db: &C, game_id: i64, exclude_id: Option<i64>, prerequisites: &challenge::PrerequisiteList,
) -> Result<Vec<challenge::Model>, ResponseError>
where
  C: ConnectionTrait, {
  let mut models = Vec::with_capacity(prerequisites.0.len());
  for &id in &prerequisites.0 {
    if Some(id) == exclude_id {
      return Err(ResponseError::BadRequest(
        "a challenge cannot be its own prerequisite".to_owned(),
      ));
    }
    let model = challenge::get(db, id).await?.ok_or_else(|| {
      ResponseError::BadRequest(format!("prerequisite challenge {id} does not exist"))
    })?;
    if model.game_id != game_id {
      return Err(ResponseError::BadRequest(format!(
        "prerequisite challenge {id} does not belong to this game"
      )));
    }
    models.push(model);
  }
  Ok(models)
}

/// Maps the given prerequisite models to their bucket names, the persistent
/// reference used inside the game repository.
pub(super) fn prerequisite_bucket_names(
  models: &[challenge::Model],
) -> Result<Vec<String>, ResponseError> {
  models
    .iter()
    .map(|model| {
      model.bucket.clone().ok_or_else(|| {
        ResponseError::InternalServerError(format!(
          "challenge {}:{} does not have a valid bucket",
          model.id, model.name
        ))
      })
    })
    .collect()
}

/// Builds the bucket config persisted in the challenge repository. Note that
/// prerequisites must already be converted to bucket names: challenge ids are
/// not persistent across databases.
pub(super) fn challenge_bucket_config(
  challenge: &challenge::Model, prerequisite_buckets: Vec<String>,
) -> Result<ChallengeConfig, ResponseError> {
  Ok(ChallengeConfig {
    name: challenge.name.clone(),
    tag: serde_json::from_value(serde_json::to_value(&challenge.tag)?)?,
    score_rule: serde_json::from_value(serde_json::to_value(&challenge.score_rule)?)?,
    avatar: challenge.avatar.clone(),
    prerequisites: prerequisite_buckets,
  })
}

/// Ensures that the prerequisite graph of the game stays acyclic when the
/// given challenge is assigned the provided prerequisites.
pub(super) async fn ensure_acyclic_prerequisites<C>(
  db: &C, game: &game::Model, challenge_id: i64, prerequisites: &challenge::PrerequisiteList,
) -> Result<(), ResponseError>
where
  C: ConnectionTrait, {
  let challenges = challenge::get_full_list(db, game.id).await?;
  let mut graph: BTreeMap<i64, Vec<i64>> = challenges
    .iter()
    .map(|c| (c.id, c.prerequisites.0.clone()))
    .collect();
  graph.insert(challenge_id, prerequisites.0.clone());
  if let Some(cycle) = find_cycle(&graph) {
    return Err(ResponseError::BadRequest(format!(
      "challenge prerequisites contain a cycle: {cycle}"
    )));
  }
  Ok(())
}

/// Ensures that no other challenge or milestone references the given
/// challenge before it is deleted.
pub(super) async fn ensure_challenge_unreferenced<C>(
  db: &C, game: &game::Model, challenge: &challenge::Model,
) -> Result<(), ResponseError>
where
  C: ConnectionTrait, {
  let challenges = challenge::get_full_list(db, game.id).await?;
  for other in &challenges {
    if other.id != challenge.id && other.prerequisites.0.contains(&challenge.id) {
      return Err(ResponseError::PreconditionFailed(format!(
        "challenge {}:{} is a prerequisite of {}:{}, remove the reference first",
        challenge.id, challenge.name, other.id, other.name
      )));
    }
  }
  let milestones = challenge_milestone::get_list(db, game.id).await?;
  for milestone in &milestones {
    if milestone.prerequisites.0.contains(&challenge.id) {
      return Err(ResponseError::PreconditionFailed(format!(
        "challenge {}:{} is a prerequisite of milestone {}, remove the reference first",
        challenge.id, challenge.name, milestone.name
      )));
    }
  }
  Ok(())
}

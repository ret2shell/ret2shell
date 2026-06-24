use axum::{
  Router,
  extract::DefaultBodyLimit,
  middleware,
  routing::{get, patch, post},
};
use r2s_bucket::{Bucket, challenge::ChallengeBucket, game::GameBucket};
use r2s_database::{challenge, game, user::Permission};

use crate::{
  middleware::{
    auth,
    data::{self},
  },
  traits::{GlobalState, ResponseError},
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
          get(submission::get_challenge_solves_status)
            .post(submission::submit_flag)
            .patch(submission::label_submission),
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

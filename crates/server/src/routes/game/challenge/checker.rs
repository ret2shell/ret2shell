use axum::{
  Extension, Json,
  extract::{Query, State},
  response::IntoResponse,
};
use r2s_bucket::Bucket;
use r2s_checker::Checker;
use r2s_database::{challenge, game};
use r2s_engine::{DiagnosticMarker, Engine};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};

use crate::{middleware::auth::Token, traits::ResponseError};

#[derive(Serialize)]
pub(super) struct CheckerResponse {
  pub script: String,
  pub lint: Vec<DiagnosticMarker>,
}

#[derive(Deserialize)]
pub(super) struct CheckerRequest {
  pub lint: Option<bool>,
}

pub(super) async fn get_checker_script(
  State(ref bucket): State<Bucket>, State(checker): State<Checker>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Query(query): Query<CheckerRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let challenge_bucket = super::get_challenge_bucket(bucket, &game, &challenge).await?;
  let lint = if let Some(true) = query.lint {
    checker.lint(&challenge_bucket).await?
  } else {
    Vec::new()
  };

  Ok(Json(CheckerResponse {
    script: challenge_bucket.checker().await?,
    lint,
  }))
}

#[derive(Deserialize)]
pub(super) struct UpdateCheckerScriptRequest {
  pub content: String,
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn update_checker_script(
  State(ref db): State<Database>, State(bucket): State<Bucket>, State(checker): State<Checker>,
  State(engine): State<Engine>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Json(req): Json<UpdateCheckerScriptRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  super::super::ensure_game_sync_writable(&db.conn, &game).await?;
  super::check_challenge_publishing(&challenge)?;
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(&bucket, &game, &challenge).await?;
  challenge_bucket.set_checker(req.content).await?;
  checker.expire(&engine, &challenge_bucket).await;
  game_bucket
    .commit(
      format!(
        ":building_construction: update checker script for challenge {}",
        challenge.name
      ),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  Ok(())
}

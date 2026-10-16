use axum::{Extension, Json, extract::State, response::IntoResponse};
use r2s_cache::Cache;
use r2s_database::{challenge, challenge_milestone, game};
use r2s_migrator::Database;
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::traits::ResponseError;

/// One node the administrator has dragged. The coordinates are logical grid
/// units rather than pixels: the web client renders them as
/// `x = COLUMN_START + col * COLUMN_PITCH` and `y = row * GRID_Y`, so the
/// stored value survives a change of those constants.
///
/// The canvas pans freely in every direction, so the coordinates are
/// deliberately unbounded — `i32` is the only limit.
#[derive(Deserialize)]
pub(super) struct LayoutNode {
  pub id: i64,
  pub col: i32,
  pub row: i32,
}

/// Payload of [`update_game_layout`]. Only the nodes that actually moved are
/// sent: a node nobody has touched keeps a `NULL` position and stays owned by
/// the automatic layout, which is what makes an untouched game render exactly
/// as it did before this feature existed.
#[derive(Deserialize)]
pub(super) struct UpdateGameLayoutRequest {
  #[serde(default)]
  pub challenges: Vec<LayoutNode>,
  #[serde(default)]
  pub milestones: Vec<LayoutNode>,
}

#[derive(Serialize)]
pub(super) struct UpdateGameLayoutResponse {
  pub updated: u64,
}

/// Persists the manual node positions of the milestone graph.
///
/// Unlike every other mutation on a game, this one **never touches the game
/// bucket and produces no git commit**. Prerequisites are part of the
/// challenge definition and therefore belong in the repository, which is what
/// makes a game portable across deployments; positions are presentation state
/// with no meaningful three-way merge, so keeping them in the database avoids
/// turning every drag into a commit and manufacturing conflicts between
/// administrators.
///
/// Writes are issued per node, so two administrators dragging different nodes
/// merge without any conflict resolution; the same node simply keeps the last
/// write, which is visible and trivially redone.
pub(super) async fn update_game_layout(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>, Json(req): Json<UpdateGameLayoutRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let mut updated = 0;
  for node in &req.challenges {
    updated +=
      challenge::update_layout(&txn, game.id, node.id, Some(node.col), Some(node.row)).await?;
  }
  for node in &req.milestones {
    updated +=
      challenge_milestone::update_layout(&txn, game.id, node.id, Some(node.col), Some(node.row))
        .await?;
  }
  txn.commit().await?;

  for node in &req.challenges {
    cache.at("challenge").del(node.id).await.ok();
  }
  cache.at("game").del(game.id).await.ok();
  info!(updated, game_id = game.id, "updated milestone graph layout");

  Ok(Json(UpdateGameLayoutResponse { updated }))
}

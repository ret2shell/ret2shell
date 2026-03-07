use axum::{Extension, Json, extract::State, response::IntoResponse};
use r2s_cache::Cache;
use r2s_cluster::Cluster;
use r2s_database::game;
use r2s_engine::{DiagnosticMarker, Engine};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::traits::ResponseError;

#[derive(Deserialize)]
pub(super) struct GameTraffic {
  pub traffic: String,
}

#[derive(Serialize)]
pub(super) struct GameScriptResponse {
  pub lint: Vec<DiagnosticMarker>,
}

pub(super) async fn update_game_traffic(
  State(cluster): State<Cluster>, State(ref db): State<Database>, State(cache): State<Cache>,
  State(engine): State<Engine>, Extension(game): Extension<game::Model>,
  Json(req): Json<GameTraffic>,
) -> Result<impl IntoResponse, ResponseError> {
  let traffic_mapper = cluster
    .traffic
    .clone()
    .ok_or(ResponseError::NotFound("traffic".to_string()))?;
  let lint = traffic_mapper.lint(&req.traffic).await?;

  game::update(
    &db.conn,
    game::Model {
      id: game.id,
      traffic: Some(req.traffic.clone()),
      ..game.clone()
    },
  )
  .await?;
  traffic_mapper
    .expire(
      &engine,
      &game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not exist".to_owned(),
        ))?,
    )
    .await;
  cache.at("game").del(game.id).await?;
  info!("updated game traffic");

  Ok(Json(GameScriptResponse { lint }))
}

pub(super) async fn delete_game_traffic(
  State(cluster): State<Cluster>, State(ref db): State<Database>, State(cache): State<Cache>,
  State(engine): State<Engine>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let traffic_mapper = cluster
    .traffic
    .clone()
    .ok_or(ResponseError::NotFound("traffic".to_string()))?;
  game::update(
    &db.conn,
    game::Model {
      id: game.id,
      traffic: None,
      ..game.clone()
    },
  )
  .await?;
  traffic_mapper
    .expire(
      &engine,
      &game.bucket.ok_or(ResponseError::PreconditionFailed(
        "game bucket not exist".to_owned(),
      ))?,
    )
    .await;
  cache.at("game").del(game.id).await?;
  info!("deleted game traffic");
  Ok(())
}

#[derive(Deserialize)]
pub(super) struct GameLifecycle {
  pub lifecycle: String,
}

pub(super) async fn update_game_lifecycle(
  State(cluster): State<Cluster>, State(ref db): State<Database>, State(cache): State<Cache>,
  State(engine): State<Engine>, Extension(game): Extension<game::Model>,
  Json(req): Json<GameLifecycle>,
) -> Result<impl IntoResponse, ResponseError> {
  let lifecycle_mapper = cluster
    .lifecycle
    .clone()
    .ok_or(ResponseError::NotFound("lifecycle".to_string()))?;
  let lint = lifecycle_mapper.lint(&req.lifecycle).await?;

  game::update(
    &db.conn,
    game::Model {
      id: game.id,
      lifecycle: Some(req.lifecycle.clone()),
      ..game.clone()
    },
  )
  .await?;
  lifecycle_mapper
    .expire(
      &engine,
      &game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not exist".to_owned(),
        ))?,
    )
    .await;
  cache.at("game").del(game.id).await?;
  info!("updated game lifecycle");

  Ok(Json(GameScriptResponse { lint }))
}

pub(super) async fn delete_game_lifecycle(
  State(cluster): State<Cluster>, State(ref db): State<Database>, State(cache): State<Cache>,
  State(engine): State<Engine>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let lifecycle_mapper = cluster
    .lifecycle
    .clone()
    .ok_or(ResponseError::NotFound("lifecycle".to_string()))?;
  game::update(
    &db.conn,
    game::Model {
      id: game.id,
      lifecycle: None,
      ..game.clone()
    },
  )
  .await?;
  lifecycle_mapper
    .expire(
      &engine,
      &game.bucket.ok_or(ResponseError::PreconditionFailed(
        "game bucket not exist".to_owned(),
      ))?,
    )
    .await;
  cache.at("game").del(game.id).await?;
  info!("deleted game lifecycle");
  Ok(())
}

#[derive(Deserialize)]
pub(super) struct GameNodeSelector {
  pub node_selector: String,
}

pub(super) async fn update_game_node_selector(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>, Json(req): Json<GameNodeSelector>,
) -> Result<impl IntoResponse, ResponseError> {
  let node_selector = req.node_selector.clone();
  game::update(
    &db.conn,
    game::Model {
      id: game.id,
      node_selector: Some(node_selector.clone()),
      ..game.clone()
    },
  )
  .await?;
  cache.at("game").del(game.id).await?;
  info!("updated game node selector");
  Ok(Json(node_selector))
}

pub(super) async fn delete_game_node_selector(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  game::update(
    &db.conn,
    game::Model {
      id: game.id,
      node_selector: None,
      ..game.clone()
    },
  )
  .await?;
  cache.at("game").del(game.id).await?;
  info!("deleted game node selector");
  Ok(())
}

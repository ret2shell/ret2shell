use axum::{
  Extension, Json,
  extract::{Query, State},
  response::IntoResponse,
};
use chrono::{DateTime, Utc, serde::ts_seconds};
use r2s_cache::Cache;
use r2s_database::{audit, game, submission, user};
use r2s_event::EventManager;
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};

use crate::traits::ResponseError;

#[derive(Serialize)]
pub(super) struct ConnectedDevice {
  client: String,
  address: String,
  #[serde(with = "ts_seconds")]
  connected_at: DateTime<Utc>,
}

pub(super) async fn get_connected_devices(
  State(event): State<EventManager>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let clients = event.clients.read().await;
  let clients = clients
    .iter()
    .filter(|(id, ..)| game.id == *id)
    .map(|(_, c, a, d)| ConnectedDevice {
      client: c.clone(),
      address: a.to_string(),
      connected_at: *d,
    })
    .collect::<Vec<_>>();
  Ok(Json(clients))
}

pub(super) async fn regenerate_game_token(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  super::ensure_game_sync_writable(&db.conn, &game).await?;
  let token = game::update(
    &db.conn,
    game::Model {
      id: game.id,
      token: Some(nanoid::nanoid!()),
      ..game.clone()
    },
  )
  .await?;
  cache.at("game").del(game.id).await?;
  Ok(Json(token))
}

pub(super) async fn get_game_administrator(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let admins = user::get_multiple(&db.conn, &game.admins.0).await?;
  Ok(Json(admins))
}

pub(super) async fn update_game_administrator(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(game): Extension<game::Model>, Json(admins): Json<Vec<i64>>,
) -> Result<impl IntoResponse, ResponseError> {
  super::ensure_game_sync_writable(&db.conn, &game).await?;
  let model = game::update(
    &db.conn,
    game::Model {
      id: game.id,
      admins: game::Admins(admins),
      ..game.clone()
    },
  )
  .await?;
  cache.at("game").del(game.id).await?;
  Ok(Json(model))
}

#[derive(Deserialize)]
pub(super) struct PaginateQuery {
  page: Option<u64>,
  page_size: Option<u64>,
}

pub(super) async fn get_submissions(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<PaginateQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let submissions = submission::get_page_ex(
    &db.conn,
    query.page.unwrap_or(1),
    query.page_size.unwrap_or(15),
    false,
    true,
    Some(game.id),
    None,
    None,
    None,
  )
  .await?;
  Ok(Json(submissions))
}

pub(super) async fn get_audit_messages(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<PaginateQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let submissions = audit::get_page_ex(
    &db.conn,
    query.page.unwrap_or(1),
    query.page_size.unwrap_or(15),
    Some(game.id),
    None,
    None,
    None,
    None,
  )
  .await?;
  Ok(Json(submissions))
}

pub(super) async fn update_audit(
  State(ref db): State<Database>, Extension(prev_model): Extension<audit::Model>,
  Json(model): Json<audit::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let model = audit::update(
    &db.conn,
    prev_model.id,
    audit::Model {
      id: prev_model.id,
      challenge_id: prev_model.challenge_id,
      team_id: prev_model.team_id,
      user_id: prev_model.user_id,
      game_id: prev_model.game_id,
      ..model
    },
  )
  .await?;
  Ok(Json(model))
}

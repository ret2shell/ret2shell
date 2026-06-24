use std::collections::HashMap;

use axum::{
  Extension, Json,
  extract::{Query, State},
  response::IntoResponse,
};
use r2s_database::{
  audit, challenge as challenge_db, game, institute, submission, team as team_db, user,
};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};

use crate::traits::ResponseError;

#[derive(Serialize, Default)]
pub(super) struct GameStatistics {
  pub total_players: u64,
  pub institute_players: HashMap<i64, u64>,
  pub total_teams: u64,
  pub total_passed_teams: u64,
  pub institute_teams: HashMap<i64, u64>,
  pub total_submissions: u64,
  pub total_solves: u64,
  pub challenge_submissions: HashMap<i64, u64>,
  pub challenge_solves: HashMap<i64, u64>,
}

#[derive(Deserialize, Clone)]
pub(super) struct GameStatisticsQuery {
  pub training: Option<bool>,
  pub institute: Option<i64>,
}

async fn get_game_statistics_impl(
  db: &Database, game: &game::Model, query: GameStatisticsQuery,
) -> Result<GameStatistics, ResponseError> {
  let training = query.training.unwrap_or(true);
  let institutes = institute::get_list(&db.conn).await?;
  let total_players =
    user::count(&db.conn, false, query.institute, Some(game.id), training).await?;
  let mut institute_players = HashMap::new();
  for i in &institutes {
    institute_players.insert(
      i.id,
      user::count(&db.conn, false, Some(i.id), Some(game.id), training).await?,
    );
  }
  let total_teams = team_db::count(
    &db.conn,
    game.id,
    team_db::State::Banned,
    query.institute,
    None,
  )
  .await?;
  let total_passed_teams = team_db::count(
    &db.conn,
    game.id,
    team_db::State::Passed,
    query.institute,
    None,
  )
  .await?;
  let mut institute_teams = HashMap::new();
  for i in &institutes {
    institute_teams.insert(
      i.id,
      team_db::count(&db.conn, game.id, team_db::State::Banned, Some(i.id), None).await?,
    );
  }
  let total_submissions = submission::count(
    &db.conn,
    false,
    Some(game.id),
    None,
    None,
    None,
    query.institute,
    training,
  )
  .await?;
  let total_solves = submission::count(
    &db.conn,
    true,
    Some(game.id),
    None,
    None,
    None,
    query.institute,
    training,
  )
  .await?;

  let mut challenge_solves = HashMap::new();
  let mut challenge_submissions = HashMap::new();
  let challenges = challenge_db::get_list(&db.conn, game.id, false).await?;
  for c in &challenges {
    challenge_solves.insert(
      c.id,
      submission::count(
        &db.conn,
        true,
        Some(game.id),
        Some(c.id),
        None,
        None,
        query.institute,
        training,
      )
      .await?,
    );
    challenge_submissions.insert(
      c.id,
      submission::count(
        &db.conn,
        false,
        Some(game.id),
        Some(c.id),
        None,
        None,
        query.institute,
        training,
      )
      .await?,
    );
  }

  Ok(GameStatistics {
    total_players,
    institute_players,
    total_teams,
    total_passed_teams,
    institute_teams,
    total_submissions,
    total_solves,
    challenge_submissions,
    challenge_solves,
  })
}

pub(super) async fn get_game_statistics(
  State(db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<GameStatisticsQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let statistics = get_game_statistics_impl(&db, &game, query).await?;
  Ok(Json(statistics))
}

#[derive(Serialize)]
pub(super) struct GameStatisticsExport {
  pub statistics: GameStatistics,
  pub scoreboard: Vec<(team_db::Model, Vec<user::Model>)>,
  pub audits: Vec<audit::ExModel>,
}

pub(super) async fn export_statistics(
  State(db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<GameStatisticsQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let statistics = get_game_statistics_impl(&db, &game, query.clone()).await?;
  let scoreboard_teams = team_db::get_page(
    &db.conn,
    game.id,
    1,
    statistics.total_teams,
    Some(team_db::State::Banned),
    query.institute,
    None,
    None,
    Some("score".to_owned()),
    false,
  )
  .await?;
  let mut scoreboard = Vec::new();
  for team in &scoreboard_teams.0 {
    let members = team_db::get_members(&db.conn, team.id).await?;
    scoreboard.push((team.clone(), members));
  }
  let audits = audit::get_list_ex(
    &db.conn,
    Some(game.id),
    query.institute,
    None,
    None,
    None,
    Some(audit::State::Confirmed),
  )
  .await?;
  Ok(Json(GameStatisticsExport {
    statistics,
    scoreboard,
    audits,
  }))
}

use std::collections::HashMap;

use axum::{
  extract::{DefaultBodyLimit, Multipart, Path, Query, State},
  middleware,
  response::IntoResponse,
  routing::{get, patch, post},
  Extension, Json, Router,
};
use chrono::{serde::ts_seconds, DateTime, Utc};
use futures::TryStreamExt;
use nanoid::nanoid;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_cluster::{traffic::MappedPort, Cluster, ClusterError, Pod, CHALLENGE_NS};
use r2s_config::GlobalConfig;
use r2s_database::{
  article, audit, challenge as challenge_db, config, game, institute, submission, team as team_db,
  user::{self, Permission},
};
use r2s_event::{
  events::{EventContainer, GameEvent, GameEventType},
  Event, EventManager,
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use tokio_util::io::StreamReader;
use tracing::{info, warn};

use crate::{
  middleware::{
    auth::{self, is_game_admin, Token},
    data::{self, extract_team},
  },
  traits::{GlobalState, ResponseError},
};

mod challenge;
mod chat;
mod notification;
mod team;
pub mod worker;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  tokio::spawn(worker::spawn_game_workers(state.clone()));
  Router::new()
    .route("/", post(create_game))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Host
    )))
    .nest(
      "/{game}",
      Router::new()
        .route(
          "/administrator",
          get(get_game_administrator).patch(update_game_administrator),
        )
        .route(
          "/traffic",
          patch(update_game_traffic).delete(delete_game_traffic),
        )
        .route(
          "/node-selector",
          patch(update_game_node_selector).delete(delete_game_node_selector),
        )
        // .nest(
        //   "/repo",
        //   Router::new().route("/", get(get_game_repo_git)).nest(
        //     "/{repo}",
        //     Router::new()
        //       .route(
        //         "/git-upload-pack",
        //         post(game_repo_git_upload_pack).options(game_repo_git_upload_pack),
        //       )
        //       .route(
        //         "/info/refs",
        //         get(game_repo_info_refs).options(game_repo_info_refs),
        //       ),
        //   ),
        // )
        .nest(
          "/registry",
          Router::new()
            .route("/config", get(get_cluster_registry_config))
            .route("/", get(get_cluster_registry_repo).post(upload_image))
            .route_layer(DefaultBodyLimit::max(2 * 1024 * 1024 * 1024))
            .route("/{image}", get(get_cluster_registry_image)),
        )
        .route("/device", get(get_connected_devices))
        .route("/introduction", patch(update_game_intro))
        .route("/submission", get(get_submissions))
        .nest(
          "/audit",
          Router::new()
            .route("/{audit}", patch(update_audit))
            .route_layer(middleware::from_fn_with_state(
              state.clone(),
              data::prepare_data!(audit, false),
            ))
            .route("/", get(get_audit_messages)),
        )
        .nest(
          "/statistics",
          Router::new()
            .route("/", get(get_game_statistics))
            .route("/export", get(export_statistics)),
        )
        .route("/", patch(update_game).delete(delete_game))
        .route_layer(middleware::from_fn(auth::game_admin_required))
        .route("/solve", get(get_self_solves))
        .route(
          "/env",
          get(get_self_envs)
            .patch(delay_self_env)
            .delete(stop_self_env),
        )
        .nest("/challenge", challenge::router(state))
        .nest("/team", team::router(state))
        .nest("/notification", notification::router(state))
        .nest("/chat", chat::router(state))
        .route("/introduction", get(get_game_intro))
        .route("/", get(get_game))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_team_info,
        ))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(game, true),
        )),
    )
    .route("/", get(get_game_list))
}

macro_rules! get_game_bucket_mut {
  ($bucket:expr, $game: expr) => {{
    $bucket
      .at_mut(
        &$game
          .bucket
          .clone()
          .ok_or(ResponseError::InternalServerError(
            "bucket is not exist for this game".into(),
            format!(
              "game {}:'{}' does not have a valid bucket",
              $game.id, $game.name
            ),
          ))?,
      )
      .await?
  }};
}

#[derive(Deserialize)]
struct GameListQuery {
  page: Option<u64>,
  page_size: Option<u64>,
  host_type: Option<game::HostType>,
  weight: Option<i32>,
}

async fn get_game_list(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Query(query): Query<GameListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let results = game::get_page(
    &db.conn,
    query.page.unwrap_or(1),
    query.page_size.unwrap_or(15),
    query.host_type,
    query.weight,
    token.permissions.0.contains(&Permission::Host)
      || token.permissions.0.contains(&Permission::Game),
  )
  .await?;
  Ok(Json((
    results
      .0
      .iter()
      .filter(|g| !g.hidden || g.admins.0.contains(&token.id))
      .cloned()
      .collect::<Vec<_>>(),
    results.1,
  )))
}

async fn get_game(
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.hidden && !is_game_admin!(token, game) {
    warn!(
      "unauthorized user {}:'{}' ({}) trying to get a hidden game {}:'{}'",
      token.id, token.account, token.nickname, game.id, game.name
    );
    return Err(ResponseError::NotFound("game not found".to_owned()));
  }
  if is_game_admin!(token, game) {
    Ok(Json(game))
  } else {
    Ok(Json(game.desensitize()))
  }
}

async fn create_game(
  State(ref db): State<Database>, State(ref bucket): State<Bucket>,
  Extension(token): Extension<Token>, Json(mut model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let game_bucket = bucket.create(serde_json::to_value(&model)?).await?;
  model.bucket = Some(game_bucket.name.clone());
  let model = game::create(
    &txn,
    game::Model {
      admins: game::Admins(vec![token.id]),
      introduction_id: None,
      token: Some(nanoid!()),
      ..model
    },
  )
  .await;

  match model {
    Ok(model) => {
      txn.commit().await?;
      Ok(Json(model))
    }
    Err(e) => {
      bucket.delete(&game_bucket.name).await.ok();
      Err(e)?
    }
  }
}

async fn update_game(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref queue): State<Queue>,
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, Json(model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let model = game::update(
    &txn,
    game::Model {
      id: game.id,
      bucket: game.bucket.clone(),
      traffic: game.traffic.clone(),
      node_selector: game.node_selector.clone(),
      introduction_id: game.introduction_id,
      ..model
    },
  )
  .await?;
  cache.at("game").del(game.id).await?;
  let game_bucket = get_game_bucket_mut!(bucket, model);
  game_bucket
    .set_config(serde_json::to_value(&model)?)
    .await?;
  game_bucket
    .commit(
      ":construction: update game config",
      "platform",
      "platform@private.ret.sh.cn",
    )
    .await?;
  txn.commit().await?;
  if game.frozen != model.frozen {
    info!(
      "user {}:'{}' ({}) {} the game {}:'{}'",
      token.id,
      token.account,
      token.nickname,
      if model.frozen { "freeze" } else { "unfreeze" },
      model.id,
      model.name
    );
    let payload = EventContainer {
      game_id: game.id,
      event: Event::Game(GameEvent {
        event_type: if model.frozen {
          GameEventType::Freeze
        } else {
          GameEventType::Unfreeze
        },
        operator: user::Model {
          id: token.id,
          account: token.account.clone(),
          nickname: token.nickname.clone(),
          ..Default::default()
        },
        message: format!(
          "{} the game",
          if model.frozen { "Freeze" } else { "Unfreeze" }
        ),
      }),
    };
    queue.publish("event", payload).await.ok();
  }
  Ok(Json(model))
}

#[derive(Deserialize)]
pub struct DeleteGameQuery {
  force: Option<bool>,
}

async fn delete_game(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Query(query): Query<DeleteGameQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let delete_result = bucket.delete(&game.bucket.clone().unwrap()).await;
  if !query.force.unwrap_or(false) {
    delete_result?;
  }
  cache.at("game").del(game.id).await?;
  game::delete(&db.conn, game.id).await?;
  Ok(())
}

async fn get_game_intro(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if let Some(intro_id) = game.introduction_id {
    let intro = article::get_ex(&db.conn, intro_id).await?;
    Ok(Json(intro))
  } else {
    Err(ResponseError::NotFound("introduction not found".to_owned()))
  }
}

async fn update_game_intro(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Extension(token): Extension<Token>,
  Json(model): Json<article::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let result = if let Some(intro_id) = game.introduction_id {
    article::update(
      &txn,
      intro_id,
      article::Model {
        id: intro_id,
        publisher_id: token.id,
        ..model
      },
    )
    .await?
  } else {
    let model = article::create(
      &txn,
      article::Model {
        id: 0,
        publisher_id: token.id,
        ..model
      },
    )
    .await?;
    game::update(
      &txn,
      game::Model {
        id: game.id,
        introduction_id: Some(model.id),
        ..game.clone()
      },
    )
    .await?;
    cache.at("game").del(game.id).await?;
    model
  };

  let game_bucket = get_game_bucket_mut!(bucket, game);
  game_bucket
    .set_introduction(&result.clone().content.unwrap_or("NO CONTENT".into()))
    .await?;
  game_bucket
    .commit(
      ":memo: update README.md",
      "platform",
      "platform@private.ret.sh.cn",
    )
    .await?;
  txn.commit().await?;

  Ok(Json(result))
}

#[derive(Serialize, Clone, Deserialize)]
struct Instance {
  pub state: String,
  pub name: String,
  pub traffic: String,
  pub ports: Vec<u16>,
  pub renew_count: i32,
  #[serde(with = "ts_seconds")]
  pub created_at: DateTime<Utc>,
  pub user_id: i64,
  pub user_name: String,
  pub team_id: i64,
  pub team_name: String,
  pub challenge_id: i64,
  pub challenge_name: String,
  pub game_id: i64,
  pub game_name: String,
  pub exposed_ports: Option<Vec<MappedPort>>,
}

macro_rules! get_pod_field {
  ($pod:ident, $domain:tt, $field:expr) => {{
    $pod
      .metadata
      .$domain
      .clone()
      .ok_or(ResponseError::Gone(format!(
        "pod field not found: {}",
        $field
      )))?
      .get($field)
      .map(|s| s.clone())
      .ok_or(ResponseError::Gone(format!(
        "pod field not found: {}",
        $field
      )))?
  }};
}

impl TryFrom<Pod> for Instance {
  type Error = ResponseError;
  fn try_from(value: Pod) -> Result<Self, Self::Error> {
    Ok(Instance {
      state: value
        .status
        .map(|s| s.phase.unwrap_or("Unknown".to_string()))
        .ok_or(ResponseError::Gone("pod status not found".to_owned()))?
        .clone(),
      name: value.metadata.name.clone().unwrap_or_default(),
      traffic: get_pod_field!(value, labels, "ret.sh.cn/traffic"),
      ports: get_pod_field!(value, annotations, "ret.sh.cn/ports")
        .split(',')
        .map(|p| p.parse().unwrap_or(0))
        .collect(),
      renew_count: get_pod_field!(value, annotations, "ret.sh.cn/renew")
        .parse()
        .map_err(|_| ResponseError::Gone("renew count not found".to_owned()))?,
      created_at: value
        .metadata
        .creation_timestamp
        .clone()
        .map(|c| c.0)
        .ok_or(ResponseError::Gone(
          "pod creation time not found".to_owned(),
        ))?,
      user_id: get_pod_field!(value, labels, "ret.sh.cn/user")
        .parse()
        .map_err(|_| ResponseError::Gone("user id not found".to_owned()))?,
      user_name: get_pod_field!(value, annotations, "ret.sh.cn/user").clone(),
      team_id: get_pod_field!(value, labels, "ret.sh.cn/team")
        .parse()
        .unwrap_or(0),
      team_name: get_pod_field!(value, annotations, "ret.sh.cn/team").clone(),
      challenge_id: get_pod_field!(value, labels, "ret.sh.cn/challenge")
        .parse()
        .map_err(|_| ResponseError::Gone("challenge id not found".to_owned()))?,
      challenge_name: get_pod_field!(value, annotations, "ret.sh.cn/challenge").clone(),
      game_id: get_pod_field!(value, labels, "ret.sh.cn/game")
        .parse()
        .map_err(|_| ResponseError::Gone("game id not found".to_owned()))?,
      game_name: get_pod_field!(value, annotations, "ret.sh.cn/game"),
      exposed_ports: None,
    })
  }
}

async fn get_self_solves(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, team_ext: Extension<Option<team_db::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  if is_game_admin!(token, game) {
    let solves = submission::get_list_ex(
      &db.conn,
      true,
      false,
      Some(game.id),
      None,
      None,
      Some(token.id),
      false,
    )
    .await?;
    return Ok(Json(solves));
  }
  let team = extract_team!(game, team_ext, token);
  let solves = submission::get_list_ex(
    &db.conn,
    true,
    false,
    Some(game.id),
    None,
    team.clone().map(|t| t.id),
    if team.is_none() { Some(token.id) } else { None },
    false,
  )
  .await?;
  Ok(Json(solves))
}

async fn get_self_envs(
  State(cluster): State<Cluster>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, team_ext: Extension<Option<team_db::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = extract_team!(game, team_ext, token);
  let envs = if let Some(team) = team {
    cluster
      .at(CHALLENGE_NS)
      .get_challenge_env_by_team(team.id)
      .await?
  } else {
    cluster
      .at(CHALLENGE_NS)
      .get_challenge_env_by_user(token.id)
      .await?
      .map(|pod| Vec::from([pod]))
      .unwrap_or_default()
  };
  let config = if let Some(config) = &config.cluster {
    config
  } else {
    return Err(ResponseError::PreconditionFailed(
      "cluster is disabled".to_owned(),
    ));
  };
  let (traffic_key, traffic_script) = if game.archive_at > Utc::now() {
    if let Some(traffic) = game.traffic.clone() {
      (
        game
          .bucket
          .clone()
          .ok_or(ResponseError::PreconditionFailed(
            "game bucket not found".to_string(),
          ))?,
        Some(traffic),
      )
    } else {
      ("default".to_string(), config.traffic.clone())
    }
  } else {
    ("default".to_string(), config.traffic.clone())
  };
  let mut result: Vec<Instance> = Vec::new();

  let traffic_mapper = cluster
    .traffic
    .clone()
    .ok_or(ResponseError::InternalServerError(
      "traffic mapper is not initialized".to_string(),
      "traffic mapper is not initialized".to_string(),
    ))?;

  for env in envs {
    let mut i: Instance = match env.clone().try_into() {
      Ok(i) => i,
      Err(e) => return Err(e),
    };

    if traffic_script.is_none() || traffic_script.clone().unwrap().is_empty() {
      result.push(i);
      continue;
    }

    let traffic_script = traffic_script.clone().unwrap();

    let traffic_id = i.traffic.clone();

    if cache.at("traffic").exists(&traffic_id).await? {
      i.exposed_ports = cache.at("traffic").get(&traffic_id).await?;
      result.push(i);
      continue;
    }

    let service = cluster
      .at(CHALLENGE_NS)
      .get_service(
        &env
          .metadata
          .name
          .clone()
          .ok_or(ResponseError::PreconditionFailed(
            "the env has no name".to_string(),
          ))?,
      )
      .await?;
    traffic_mapper
      .preload(&traffic_key, &traffic_script)
      .await?;
    let exposed_ports = traffic_mapper.expose(&traffic_key, env, service).await?;
    cache
      .at("traffic")
      .set_ex(&traffic_id, &exposed_ports, 3600)
      .await?;
    i.exposed_ports = Some(exposed_ports);
    result.push(i);
  }

  Ok(Json(result))
}

async fn delay_self_env(
  State(cluster): State<Cluster>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  cluster
    .at(CHALLENGE_NS)
    .delay_challenge_env(token.id)
    .await?;
  Ok(())
}

async fn stop_self_env(
  State(cluster): State<Cluster>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  cluster
    .at(CHALLENGE_NS)
    .stop_challenge_env(token.id)
    .await?;
  Ok(())
}

#[derive(Serialize)]
struct ConnectedDevice {
  client: String,
  address: String,
  #[serde(with = "ts_seconds")]
  connected_at: DateTime<Utc>,
}

async fn get_connected_devices(
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

async fn get_game_administrator(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let admins = user::get_multiple(&db.conn, &game.admins.0).await?;
  Ok(Json(admins))
}

async fn update_game_administrator(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(game): Extension<game::Model>, Json(admins): Json<Vec<i64>>,
) -> Result<impl IntoResponse, ResponseError> {
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
struct PaginateQuery {
  page: Option<u64>,
  page_size: Option<u64>,
}

async fn get_submissions(
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

async fn get_audit_messages(
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

async fn update_audit(
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

#[derive(Serialize, Default)]
struct GameStatistics {
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
struct GameStatisticsQuery {
  pub in_game: Option<bool>,
  pub institute: Option<i64>,
}

async fn get_game_statistics_impl(
  db: &Database, game: &game::Model, query: GameStatisticsQuery,
) -> Result<GameStatistics, ResponseError> {
  let in_game = query.in_game.unwrap_or(false);
  let institutes = institute::get_list(&db.conn).await?;
  let total_players = user::count(&db.conn, false, query.institute, Some(game.id), in_game).await?;
  let mut institute_players = HashMap::new();
  for i in institutes.iter() {
    institute_players.insert(
      i.id,
      user::count(&db.conn, false, Some(i.id), Some(game.id), in_game).await?,
    );
  }
  let total_teams =
    team_db::count(&db.conn, game.id, team_db::State::Banned, query.institute).await?;
  let total_passed_teams =
    team_db::count(&db.conn, game.id, team_db::State::Passed, query.institute).await?;
  let mut institute_teams = HashMap::new();
  for i in institutes.iter() {
    institute_teams.insert(
      i.id,
      team_db::count(&db.conn, game.id, team_db::State::Banned, Some(i.id)).await?,
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
    in_game,
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
    in_game,
  )
  .await?;

  let mut challenge_solves = HashMap::new();
  let mut challenge_submissions = HashMap::new();
  let challenges = challenge_db::get_list(&db.conn, game.id, false).await?;
  for c in challenges.iter() {
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
        in_game,
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
        in_game,
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

async fn get_game_statistics(
  State(db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<GameStatisticsQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let statistics = get_game_statistics_impl(&db, &game, query).await?;
  Ok(Json(statistics))
}

#[derive(Serialize)]
struct GameStatisticsExport {
  pub statistics: GameStatistics,
  pub scoreboard: Vec<(team_db::Model, Vec<user::Model>)>,
  pub audits: Vec<audit::ExModel>,
}

async fn export_statistics(
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
    Some("score".to_owned()),
    false,
  )
  .await?;
  let mut scoreboard = Vec::new();
  for team in scoreboard_teams.0.iter() {
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

async fn get_cluster_registry_repo(
  State(config): State<GlobalConfig>, State(cluster): State<Cluster>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if config
    .cluster
    .is_none_or(|c| c.registry.is_none_or(|r| r.enabled.is_none_or(|i| !i)))
  {
    return Ok(Json(vec![]));
  };
  let repos: Option<Vec<String>> = cache
    .at("registry")
    .get(&game.bucket.clone().unwrap_or("_".to_string()))
    .await?;
  if let Some(repos) = repos {
    return Ok(Json(repos));
  }
  let mut registry = if let Some(registry) = cluster.registry {
    registry
  } else {
    return Err(ResponseError::NotFound("registry".to_string()));
  };

  let repos = registry.sync_repo().await?;
  for i in repos.iter() {
    let (org, repo) = i;
    cache.at("registry").set(org, repo).await?;
  }
  Ok(Json(
    repos
      .get(&game.bucket.unwrap_or("_".to_string()))
      .unwrap_or(&vec![])
      .clone(),
  ))
}

async fn get_cluster_registry_image(
  State(cluster): State<Cluster>, Path(params): Path<HashMap<String, String>>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let registry = if let Some(registry) = cluster.registry {
    registry
  } else {
    return Err(ResponseError::NotFound("registry".to_string()));
  };
  let image = params
    .get("image")
    .ok_or(ResponseError::BadRequest("no image".to_string()))?;
  let tags = registry
    .images(&format!(
      "{}/{image}",
      game.bucket.unwrap_or("_".to_string())
    ))
    .await?;
  Ok(Json(tags))
}

async fn upload_image(
  State(cluster): State<Cluster>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>, mut multipart: Multipart,
) -> Result<impl IntoResponse, ResponseError> {
  let registry = if let Some(registry) = cluster.registry {
    registry
  } else {
    return Err(ResponseError::NotFound("registry".to_string()));
  };
  if let Some(field) = multipart
    .next_field()
    .await
    .map_err(|err| ResponseError::BadRequest(err.to_string()))?
  {
    let file_name = field
      .file_name()
      .ok_or(ResponseError::BadRequest(
        "file name is required".to_owned(),
      ))?
      .to_owned();
    let reader =
      StreamReader::new(field.map_err(|multipart_error| {
        std::io::Error::new(std::io::ErrorKind::Other, multipart_error)
      }));
    registry
      .upload_image(
        &game.bucket.clone().unwrap_or("_".to_string()),
        &file_name,
        reader,
      )
      .await?;
    cache
      .at("registry")
      .del(&game.bucket.unwrap_or("_".to_string()))
      .await?;
    Ok(())
  } else {
    Err(ResponseError::BadRequest("no file".to_string()))
  }
}

async fn get_cluster_registry_config(
  State(config): State<GlobalConfig>,
) -> Result<impl IntoResponse, ResponseError> {
  if let Some(cluster) = config.cluster {
    Ok(Json(cluster.registry))
  } else {
    Ok(Json(None))
  }
}

#[derive(Deserialize)]
struct GameTraffic {
  pub traffic: String,
}

#[derive(Serialize)]
struct GameTrafficResponse {
  pub lint: Option<String>,
}

async fn update_game_traffic(
  State(cluster): State<Cluster>, State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>, Json(req): Json<GameTraffic>,
) -> Result<impl IntoResponse, ResponseError> {
  let traffic_mapper = cluster
    .traffic
    .clone()
    .ok_or(ResponseError::NotFound("traffic".to_string()))?;
  let lint = traffic_mapper.lint(&req.traffic).await;
  let lint = if let Err(lint) = lint {
    match lint {
      ClusterError::CompileError(diagnostics) => Some(diagnostics),
      err => {
        warn!("failed to lint script: {:?}", err);
        Some(err.to_string())
      }
    }
  } else {
    None
  };
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
      &game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket does not exist".to_owned(),
        ))?,
    )
    .await;
  cache.at("game").del(game.id).await?;

  Ok(Json(GameTrafficResponse { lint }))
}

async fn delete_game_traffic(
  State(cluster): State<Cluster>, State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>,
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
    .expire(&game.bucket.ok_or(ResponseError::PreconditionFailed(
      "game bucket not exist".to_owned(),
    ))?)
    .await;
  cache.at("game").del(game.id).await?;
  Ok(())
}

#[derive(Deserialize)]
struct GameNodeSelector {
  pub node_selector: String,
}

async fn update_game_node_selector(
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
  Ok(Json(node_selector))
}

async fn delete_game_node_selector(
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
  Ok(())
}

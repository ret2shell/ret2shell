use std::collections::HashMap;

use axum::{
  Extension, Json, Router,
  body::{Body, Bytes},
  extract::{DefaultBodyLimit, Multipart, Path, Query, State},
  http::{
    HeaderMap, StatusCode,
    header::{CACHE_CONTROL, CONTENT_TYPE},
  },
  middleware,
  response::IntoResponse,
  routing::{delete, get, patch, post},
};
use chrono::{DateTime, Utc, serde::ts_seconds};
use futures::TryStreamExt;
use nanoid::nanoid;
use r2s_bucket::{Bucket, git::to_pkt_line};
use r2s_cache::Cache;
use r2s_cluster::{CHALLENGE_NS, Cluster, ClusterError, Pod, traffic::MappedPort};
use r2s_config::GlobalConfig;
use r2s_database::{
  article, audit, challenge as challenge_db, config,
  game::{self, ArchivePolicy},
  institute, submission, team as team_db,
  user::{self, Permission},
};
use r2s_engine::DiagnosticMarker;
use r2s_event::{
  Event, EventManager,
  events::{EventContainer, GameEvent, GameEventType},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use regex::Regex;
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;
use tokio_util::io::{ReaderStream, StreamReader};
use tower_http::request_id::RequestId;
use tracing::{error, info, warn};

use crate::{
  middleware::{
    auth::{self, Token, is_game_admin},
    data::{self, extract_team},
  },
  traits::{GlobalState, ResponseError},
  worker,
};

mod challenge;
mod chat;
mod notification;
mod team;

// // default_chain!(game.archive_policy.clone(), challenge.show_answer)
// #[macro_export]
// macro_rules! default_chain {
//   ($root:expr, $($key:ident).+) => {
//       $root.unwrap_or_default()
//       $(.$key.unwrap_or_default())+
//   };
// }

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  tokio::spawn(worker::game::spawn_game_workers(state.clone()));
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
        .nest(
          "/repo",
          Router::new().route("/", get(get_game_repo_git)).nest(
            "/{repo}",
            Router::new()
              .route(
                "/git-upload-pack",
                post(game_repo_git_upload_pack).options(game_repo_git_upload_pack),
              )
              .route(
                "/git-receive-pack",
                post(game_repo_git_receive_pack).options(game_repo_git_receive_pack),
              )
              .route(
                "/info/refs",
                get(game_repo_info_refs).options(game_repo_info_refs),
              ),
          ),
        )
        .nest(
          "/registry",
          Router::new()
            .route("/config", get(get_cluster_registry_config))
            .route("/refresh", delete(refresh_cluster_registry))
            .route("/", get(get_cluster_registry_repo).post(upload_image))
            .route_layer(DefaultBodyLimit::max(2 * 1024 * 1024 * 1024))
            .route("/{image}", get(get_cluster_registry_image)),
        )
        .route("/device", get(get_connected_devices))
        .route("/token", post(regenerate_game_token))
        .route("/introduction", patch(update_game_intro))
        .route("/submission", get(get_submissions))
        .nest(
          "/audit",
          Router::new()
            .route("/{audit}", patch(update_audit))
            .route_layer(middleware::from_fn_with_state(
              state.clone(),
              data::prepare_data!(audit, false, id),
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
        .route("/instance", get(get_self_instances))
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
          data::prepare_data!(game, true, id, name),
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
          )).inspect_err(|err| {
            tracing::warn!(error=?err, "game does not have a valid bucket");
          })?,
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
    warn!("unauthorized user trying to get a hidden game");
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
      archive_policy: ArchivePolicy::default(),
      ..model
    },
  )
  .await;

  match model {
    Ok(model) => {
      txn.commit().await?;
      info!(game_id=%model.id, game_name=%model.name, "created game");
      Ok(Json(model))
    }
    Err(e) => {
      bucket.delete(&game_bucket.name).await.ok();
      warn!(error=?e, "failed to create game, rolling back bucket creation");
      Err(e)?
    }
  }
}

#[allow(clippy::too_many_arguments)]
async fn update_game(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref queue): State<Queue>,
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Extension(trace): Extension<RequestId>, Extension(token): Extension<Token>,
  Json(model): Json<game::Model>,
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
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  txn.commit().await?;
  if game.frozen != model.frozen {
    info!(
      "user {} the game",
      if model.frozen { "freeze" } else { "unfreeze" },
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
    queue
      .publish(
        "event",
        payload,
        &trace.header_value().to_str().unwrap_or("UNKNOWN"),
      )
      .await
      .ok();
  }
  info!("updated game");
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
  let challenges = challenge_db::count(&db.conn, Some(game.id), Some(game.host_type), true).await?;
  if challenges > 0 && !query.force.unwrap_or(false) {
    return Err(ResponseError::PreconditionFailed(
      "game has existing challenges, can not be deleted safely".to_owned(),
    ));
  }
  cache.at("game").del(game.id).await?;
  game::delete(&db.conn, game.id).await?;
  let delete_result = bucket.delete(&game.bucket.clone().unwrap()).await;
  if !query.force.unwrap_or(false) {
    delete_result?;
  }
  info!("deleted game");
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
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  txn.commit().await?;
  info!("created introduction for game");

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

pub(crate) use get_pod_field;

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
      true,
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
    true,
  )
  .await?;
  Ok(Json(solves))
}

async fn get_self_instances(
  State(cluster): State<Cluster>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, team_ext: Extension<Option<team_db::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = extract_team!(game, team_ext, token);
  let mut envs = cluster
    .at(CHALLENGE_NS)
    .get_challenge_env_by_user(token.id)
    .await?;
  if let Some(team) = team {
    envs.extend(
      cluster
        .at(CHALLENGE_NS)
        .get_challenge_env_by_team(team.id)
        .await?,
    );
  }
  envs.sort_by(|a, b| a.metadata.name.cmp(&b.metadata.name));
  envs.dedup_by(|a, b| a.metadata.name == b.metadata.name);
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
    ))
    .inspect_err(|err| {
      warn!(error=?err, "traffic mapper is not initialized");
    })?;

  for env in envs {
    let mut i: Instance = match env.clone().try_into() {
      Ok(i) => i,
      Err(e) => return Err(e),
    };

    if traffic_script.is_none() || traffic_script.clone().unwrap().is_empty() {
      result.push(i);
      continue;
    }

    if result.iter().any(|r| r.traffic == i.traffic) {
      continue;
    }

    let traffic_id = i.traffic.clone();

    if cache.at("traffic").exists(&traffic_id).await? {
      i.exposed_ports = cache.at("traffic").get(&traffic_id).await?;
      result.push(i);
      continue;
    }

    let traffic_script = traffic_script.clone().unwrap();
    let env_name = env
      .metadata
      .name
      .clone()
      .ok_or(ResponseError::PreconditionFailed(
        "the env has no name".to_string(),
      ))?;

    let service = match cluster.at(CHALLENGE_NS).get_service(&env_name).await {
      Ok(service) => service,
      Err(ClusterError::KubeError(e)) => {
        warn!(
          env=%env_name,
          error=?e,
          "service not found in game, maybe not initialized?",
        );
        result.push(i);
        continue;
      }
      Err(e) => {
        return Err(e.into());
      }
    };
    traffic_mapper
      .preload(&traffic_key, &traffic_script)
      .await?;
    let exposed_ports = match traffic_mapper.expose(&traffic_key, env, service).await {
      Ok(ports) => ports,
      Err(ClusterError::MissingField(e)) => {
        warn!(field=%e, env=%env_name, "traffic mapper missing field for env, maybe the cluster is maintaining?",);
        result.push(i);
        continue;
      }
      Err(e) => {
        error!(error=?e, env=%env_name, "failed to expose traffic for env");
        return Err(e.into());
      }
    };
    cache
      .at("traffic")
      .set_ex(&traffic_id, &exposed_ports, 3600)
      .await?;
    i.exposed_ports = Some(exposed_ports);
    result.push(i);
  }

  Ok(Json(result))
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

async fn regenerate_game_token(
  State(ref db): State<Database>, State(ref cache): State<Cache>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let token = game::update(
    &db.conn,
    game::Model {
      id: game.id,
      token: Some(nanoid!()),
      ..game.clone()
    },
  )
  .await?;
  cache.at("game").del(game.id).await?;
  Ok(Json(token))
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
  for i in institutes.iter() {
    institute_players.insert(
      i.id,
      user::count(&db.conn, false, Some(i.id), Some(game.id), training).await?,
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
    let reader = StreamReader::new(field.map_err(std::io::Error::other));
    registry
      .upload_image(
        game.bucket.as_ref().unwrap_or(&"_".to_string()),
        &file_name,
        reader,
      )
      .await?;
    cache
      .at("registry")
      .del(game.bucket.as_ref().unwrap_or(&"_".to_string()))
      .await?;
    info!(
      repo=%game.bucket.unwrap_or("_".to_string()),
      image=%file_name,
      "uploaded image to registry via file upload");
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

async fn refresh_cluster_registry(
  State(cache): State<Cache>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  cache.at("registry").del("_").await?;
  cache
    .at("registry")
    .del(game.bucket.as_ref().unwrap_or(&"_".to_string()))
    .await?;
  Ok(())
}

#[derive(Deserialize)]
struct GameTraffic {
  pub traffic: String,
}

#[derive(Serialize)]
struct GameTrafficResponse {
  pub lint: Vec<DiagnosticMarker>,
}

async fn update_game_traffic(
  State(cluster): State<Cluster>, State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(game): Extension<game::Model>, Json(req): Json<GameTraffic>,
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
      &game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket does not exist".to_owned(),
        ))?,
    )
    .await;
  cache.at("game").del(game.id).await?;
  info!("updated game traffic");

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
  info!("deleted game traffic");
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
  info!("updated game node selector");
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
  info!("deleted game node selector");
  Ok(())
}

#[derive(Deserialize)]
struct GameRepoGitQuery {
  pub path: Option<String>,
}

async fn get_game_repo_git(
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Query(query): Query<GameRepoGitQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let game_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not found".to_owned(),
        ))?,
    )
    .await?;
  let path = match query.path {
    Some(path) => path,
    None => ".".to_owned(),
  };

  Ok(Json(game_bucket.git.list_objects(&path).await?))
}

#[derive(Clone, Deserialize)]
struct InfoRefsQuery {
  pub service: String,
}

impl InfoRefsQuery {
  pub fn service_trimmed(&self) -> String {
    self.service.trim_start_matches("git-").to_owned()
  }
}

fn check_git_protocol_safe(protocol: impl AsRef<str>) -> bool {
  let re = Regex::new(r"^[0-9a-zA-Z]+=[0-9a-zA-Z]+(:[0-9a-zA-Z]+=[0-9a-zA-Z]+)*$").unwrap();
  re.is_match(protocol.as_ref())
}

fn get_protocol(headers: &HeaderMap) -> Result<String, ResponseError> {
  let protocol = headers.get("Git-Protocol");
  if let Some(protocol) = protocol {
    let protocol = protocol.to_str().map_err(|err| {
      error!("Invalid git protocol: {}", err);
      ResponseError::BadRequest("invalid git protocol".to_owned())
    })?;
    if check_git_protocol_safe(protocol) {
      Ok(protocol.to_owned())
    } else {
      Err(ResponseError::BadRequest("invalid git protocol".to_owned()))
    }
  } else {
    Ok("".to_owned())
  }
}

async fn game_repo_info_refs(
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Query(query): Query<InfoRefsQuery>, headers: HeaderMap, body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  // let config = config.read().await;
  let service = query.service_trimmed();
  let protocol = get_protocol(&headers)?;
  let mut headers = HeaderMap::new();

  headers.insert(
    CONTENT_TYPE,
    format!("application/x-git-{service}-advertisement")
      .parse()
      .unwrap(),
  );
  headers.insert(CACHE_CONTROL, "no-cache".parse().unwrap());

  let game_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not found".to_owned(),
        ))?,
    )
    .await?;

  let stream_reader = StreamReader::new(body.into_data_stream().map_err(std::io::Error::other));

  let stdout = match service.as_str() {
    "upload-pack" => {
      game_bucket
        .git
        .info_refs_upload(protocol, stream_reader)
        .await
    }
    "receive-pack" => {
      game_bucket
        .git
        .info_refs_receive(protocol, stream_reader)
        .await
    }
    _ => return Err(ResponseError::BadRequest("Invalid git service".to_owned())),
  };

  let stdout = match stdout {
    Ok(stdout) => stdout,
    Err(err) => {
      error!(error=?err, "failed to run git rpc");
      return Err(ResponseError::InternalServerError(
        "failed to run git rpc".to_owned(),
      ));
    }
  };

  let stdout_stream = ReaderStream::new(stdout);
  let header = tokio_stream::once(Ok(Bytes::from(format!(
    "{}0000",
    to_pkt_line(format!("# service=git-{service}\n"))
  ))));
  let stream = header.chain(stdout_stream);

  Ok((StatusCode::OK, headers, Body::from_stream(stream)))
}

async fn game_repo_git_rpc(
  service_name: &str, bucket: Bucket, game: game::Model, headers: HeaderMap, body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  let expected_content_type = format!("application/x-git-{service_name}-request");
  let content_type = headers.get(CONTENT_TYPE).ok_or(ResponseError::BadRequest(
    "missing content type for git rpc".to_owned(),
  ))?;
  if content_type
    .to_str()
    .map_err(|_| ResponseError::BadRequest("invalid content type for git rpc".to_owned()))?
    != expected_content_type
  {
    return Err(ResponseError::BadRequest(
      "invalid content type for git rpc".to_owned(),
    ));
  }

  let protocol = get_protocol(&headers)?;
  let mut headers = HeaderMap::new();
  headers.insert(
    CONTENT_TYPE,
    format!("application/x-git-{service_name}-result")
      .parse()
      .unwrap(),
  );

  let game_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not found".to_owned(),
        ))?,
    )
    .await?;
  let stream_reader = StreamReader::new(body.into_data_stream().map_err(std::io::Error::other));

  let stdout = match service_name {
    "upload-pack" => game_bucket.git.upload_pack(protocol, stream_reader).await,
    "receive-pack" => game_bucket.git.receive_pack(protocol, stream_reader).await,
    _ => return Err(ResponseError::BadRequest("invalid git service".to_owned())),
  };

  let stdout = match stdout {
    Ok(stdout) => stdout,
    Err(err) => {
      error!(error=?err, "failed to run git rpc");
      return Err(ResponseError::InternalServerError(
        "failed to run git rpc".to_owned(),
      ));
    }
  };

  let stdout_stream = ReaderStream::new(stdout);

  Ok((StatusCode::OK, headers, Body::from_stream(stdout_stream)))
}

async fn game_repo_git_receive_pack() -> Result<(), ResponseError> {
  Err(ResponseError::Gone(
    "this feature is not implemented".to_owned(),
  ))
}

async fn game_repo_git_upload_pack(
  State(bucket): State<Bucket>, Extension(game): Extension<game::Model>, headers: HeaderMap,
  body: Body,
) -> Result<impl IntoResponse, ResponseError> {
  game_repo_git_rpc("upload-pack", bucket, game, headers, body).await
}

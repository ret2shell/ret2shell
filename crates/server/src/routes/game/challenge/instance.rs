use std::collections::HashSet;

use axum::{Extension, Json, extract::State, response::IntoResponse};
use chrono::Utc;
use nanoid::nanoid;
use r2s_bucket::Bucket;
use r2s_cluster::{
  CHALLENGE_NS, Cluster,
  lifecycle::{LifecycleEvent, LifecycleStopReason},
};
use r2s_config::cluster::ChallengeEnv;
use r2s_database::{
  challenge, config, game, team,
  user::{self, Permission},
};
use serde_json::to_value;
use tower_http::request_id::RequestId;
use tracing::{debug, info, warn};

use crate::{
  middleware::{auth::Token, data::extract_team},
  routes::game::{get_pod_field, lifecycle},
  traits::{GlobalState, ResponseError},
};

const LABEL_ALPHABET: [char; 62] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i',
  'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B',
  'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U',
  'V', 'W', 'X', 'Y', 'Z',
];

pub(super) async fn get_challenge_env_config(
  State(ref bucket): State<Bucket>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let challenge_bucket = super::get_challenge_bucket(bucket, &game, &challenge).await?;
  let env_config = challenge_bucket.env().await?;
  if crate::middleware::auth::is_game_admin!(token, game) {
    Ok(Json(env_config))
  } else {
    Ok(Json(env_config.map(|c| c.desensitize())))
  }
}

pub(super) async fn start_challenge_instance(
  State(state): State<GlobalState>, Extension(config_model): Extension<config::Model>,
  Extension(game): Extension<game::Model>, Extension(challenge): Extension<challenge::Model>,
  Extension(token): Extension<Token>, Extension(trace): Extension<RequestId>,
  team_ext: Extension<Option<team::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let bucket = state.bucket.clone();
  let cluster = state.cluster.clone();
  let cache = state.cache.clone();
  let checker = state.checker.clone();
  let engine = state.engine.clone();
  let team = extract_team!(game, team_ext, token);
  let team = if team.is_some()
    && game.in_progress()
    && challenge.archive_at.is_none_or(|t| t > Utc::now())
  {
    team
  } else {
    None
  };
  let config = if let Some(config) = &config_model.cluster {
    config
  } else {
    return Err(ResponseError::PreconditionFailed(
      "cluster is disabled".to_owned(),
    ));
  };
  let calmdown = cache.at("cluster").exists(token.id.to_string()).await?;
  if calmdown {
    warn!("user is starting challenge env too frequently",);
    return Err(ResponseError::PreconditionFailed(
      "please wait for rebuilding cargo crates".to_owned(),
    ));
  }

  match team.clone() {
    Some(team) => {
      let pods = cluster
        .at(CHALLENGE_NS)
        .get_challenge_env_by_team(team.id)
        .await?;
      if pods.len() >= game.team_size as usize {
        warn!(
          limit=%game.team_size,
          "team tried to start more instances at the same time",
        );
        return Err(ResponseError::PreconditionFailed(format!(
          "your team can only start {} instance(s) at the same time",
          game.team_size
        )));
      }
      for pod in pods.iter() {
        if get_pod_field!(pod, labels, "ret.sh.cn/challenge") == challenge.id.to_string() {
          return Err(ResponseError::Conflict(
            "this challenge instance is already launched".to_owned(),
          ));
        }
      }
    }
    None => {
      if !cluster
        .at(CHALLENGE_NS)
        .get_challenge_env_by_user(token.id)
        .await?
        .is_empty()
      {
        warn!("user tried to start more instances at the same time");
        return Err(ResponseError::PreconditionFailed(
          "you can only start one instance at the same time".to_owned(),
        ));
      }
    }
  }

  let challenge_bucket = super::get_challenge_bucket(&bucket, &game, &challenge).await?;

  if let Some(env_config) = challenge_bucket.env().await? {
    if env_config.images.is_empty() || env_config.images.iter().all(|i| i.port.is_none()) {
      return Err(ResponseError::PreconditionFailed(
        "at least one service with its exposed port is required".to_owned(),
      ));
    }

    info!("starting challenge env");

    debug!(?env_config);
    let ports = env_config
      .clone()
      .images
      .into_iter()
      .map(|s| s.port)
      .filter(|p| p.is_some())
      .map(|p| p.expect("checked as some").to_string())
      .collect::<Vec<_>>()
      .join(",");
    checker
      .preload(&engine, &challenge, &challenge_bucket)
      .await?;
    debug!("checker preloaded");
    let env_map = checker
      .environ(
        &engine,
        &challenge_bucket,
        &user::Model {
          id: token.id,
          nickname: token.nickname.clone(),
          account: token.account.clone(),
          ..Default::default()
        },
        &team,
      )
      .await?;
    debug!(?env_map);
    debug!(?game);
    let node_selector = if game.archive_at > Utc::now() {
      game.node_selector.clone().or(config.node_selector.clone())
    } else {
      config.node_selector.clone()
    }
    .and_then(|ns| if ns.is_empty() { None } else { Some(ns) });

    let need_expose = if game.archive_at > Utc::now() {
      game.traffic.is_some() || config.traffic.is_some()
    } else {
      config.traffic.is_some()
    };
    let lifecycle_team = team.clone();
    debug!(?node_selector);
    debug!(?need_expose);
    let snapshot = cluster
      .at(CHALLENGE_NS)
      .create_challenge_env(
        [
          ("ret.sh.cn/challenge", challenge.id.to_string()),
          (
            "ret.sh.cn/team",
            team
              .clone()
              .map(|t| t.id.to_string())
              .unwrap_or("0".to_owned()),
          ),
          ("ret.sh.cn/game", game.id.to_string()),
          ("ret.sh.cn/user", token.id.to_string()),
          ("ret.sh.cn/traffic", nanoid!(21, &LABEL_ALPHABET)),
          ("ret.sh.cn/internet", env_config.internet.to_string()),
        ]
        .iter()
        .map(|(k, v)| (k.to_owned().to_owned(), v.to_owned()))
        .collect(),
        [
          ("ret.sh.cn/challenge", challenge.name.to_string()),
          (
            "ret.sh.cn/team",
            team
              .map(|t| t.name.to_string())
              .unwrap_or("wheel".to_owned()),
          ),
          ("ret.sh.cn/game", game.name.to_string()),
          ("ret.sh.cn/user", token.account.to_string()),
          ("ret.sh.cn/user-nickname", token.nickname.to_string()),
          ("ret.sh.cn/renew", 0.to_string()),
          ("ret.sh.cn/ports", ports),
        ]
        .iter()
        .map(|(k, v)| (k.to_owned().to_owned(), v.to_owned()))
        .collect(),
        env_map,
        env_config,
        node_selector,
        need_expose,
      )
      .await?;
    cache
      .at("cluster")
      .set_ex(token.id.to_string(), Utc::now().timestamp(), 60)
      .await?;
    lifecycle::spawn_request_hooks(lifecycle::RequestLifecycleHooks {
      state: state.clone(),
      config: config_model.clone(),
      game: game.clone(),
      challenge: challenge.clone(),
      token: token.clone(),
      team: lifecycle_team,
      snapshots: vec![snapshot],
      event: LifecycleEvent::Start,
      trace_id: trace
        .header_value()
        .to_str()
        .unwrap_or("UNKNOWN")
        .to_owned(),
    });
    Ok(())
  } else {
    Err(ResponseError::PreconditionFailed(
      "challenge does not have online environment".to_owned(),
    ))
  }
}

pub(super) async fn delay_challenge_instance(
  State(state): State<GlobalState>, Extension(config_model): Extension<config::Model>,
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>, Extension(trace): Extension<RequestId>,
  team_ext: Extension<Option<team::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = extract_team!(game, team_ext, token);
  let lifecycle_team = team.clone();
  let cluster = state.cluster.at(CHALLENGE_NS);
  let trace_id = trace
    .header_value()
    .to_str()
    .unwrap_or("UNKNOWN")
    .to_owned();

  let pods = if let Some(team) = team {
    info!("delaying challenge env");
    cluster
      .delay_challenge_env_by_team(challenge.id, team.id)
      .await?
  } else {
    Vec::new()
  };
  if !pods.is_empty() {
    lifecycle::spawn_request_hooks(lifecycle::RequestLifecycleHooks {
      state: state.clone(),
      config: config_model.clone(),
      game: game.clone(),
      challenge: challenge.clone(),
      token: token.clone(),
      team: lifecycle_team.clone(),
      snapshots: pods,
      event: LifecycleEvent::Delay,
      trace_id: trace_id.clone(),
    });
    return Ok(());
  }

  info!("delaying challenge env");
  let pods = cluster
    .delay_challenge_env_by_user(challenge.id, token.id)
    .await?;
  if !pods.is_empty() {
    lifecycle::spawn_request_hooks(lifecycle::RequestLifecycleHooks {
      state: state.clone(),
      config: config_model.clone(),
      game: game.clone(),
      challenge: challenge.clone(),
      token: token.clone(),
      team: lifecycle_team,
      snapshots: pods,
      event: LifecycleEvent::Delay,
      trace_id,
    });
  }

  Ok(())
}

pub(super) async fn stop_challenge_instance(
  State(state): State<GlobalState>, Extension(config_model): Extension<config::Model>,
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>, Extension(trace): Extension<RequestId>,
  team_ext: Extension<Option<team::Model>>,
) -> Result<impl IntoResponse, ResponseError> {
  let team = extract_team!(game, team_ext, token);
  let lifecycle_team = team.clone();
  let cluster = state.cluster.at(CHALLENGE_NS);
  let trace_id = trace
    .header_value()
    .to_str()
    .unwrap_or("UNKNOWN")
    .to_owned();

  let pods = if let Some(team) = team {
    info!("stopping challenge env");
    cluster
      .stop_challenge_env_by_team(challenge.id, team.id)
      .await?
  } else {
    Vec::new()
  };
  if !pods.is_empty() {
    lifecycle::spawn_request_hooks(lifecycle::RequestLifecycleHooks {
      state: state.clone(),
      config: config_model.clone(),
      game: game.clone(),
      challenge: challenge.clone(),
      token: token.clone(),
      team: lifecycle_team.clone(),
      snapshots: pods,
      event: LifecycleEvent::Stop(LifecycleStopReason::Manual),
      trace_id: trace_id.clone(),
    });
    return Ok(());
  }

  info!("stopping challenge env");
  let pods = cluster
    .stop_challenge_env_by_user(challenge.id, token.id)
    .await?;

  if !pods.is_empty() {
    lifecycle::spawn_request_hooks(lifecycle::RequestLifecycleHooks {
      state: state.clone(),
      config: config_model.clone(),
      game: game.clone(),
      challenge: challenge.clone(),
      token: token.clone(),
      team: lifecycle_team,
      snapshots: pods,
      event: LifecycleEvent::Stop(LifecycleStopReason::Manual),
      trace_id,
    });
  }

  Ok(())
}

pub(super) async fn update_challenge_env_config(
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, Extension(challenge): Extension<challenge::Model>,
  Json(env): Json<ChallengeEnv>,
) -> Result<impl IntoResponse, ResponseError> {
  super::check_challenge_publishing(&challenge)?;

  let mut ports = HashSet::new();
  for image in &env.images {
    if let Some(port) = image.port
      && !ports.insert(port)
    {
      return Err(ResponseError::BadRequest("port conflict".to_owned()));
    }
  }
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(bucket, &game, &challenge).await?;
  challenge_bucket.set_env(to_value(&env)?).await?;
  game_bucket
    .commit(
      format!(
        ":building_construction: update env for challenge {}",
        challenge.name
      ),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;

  Ok(())
}

pub(super) async fn delete_challenge_env_config(
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Extension(token): Extension<Token>, Extension(challenge): Extension<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  super::check_challenge_publishing(&challenge)?;
  let (game_bucket, challenge_bucket) =
    super::get_challenge_bucket_mut(bucket, &game, &challenge).await?;
  challenge_bucket.delete_env().await?;
  game_bucket
    .commit(
      format!(":fire: delete env for challenge {}", challenge.name),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  Ok(())
}

pub(super) async fn get_all_running_instances_for_challenge(
  State(ref cluster): State<Cluster>, Extension(challenge): Extension<challenge::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let instances = cluster
    .at(CHALLENGE_NS)
    .get_challenge_env(challenge.id)
    .await?;
  Ok(Json(instances))
}

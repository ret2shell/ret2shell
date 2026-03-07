use axum::{
  Extension, Json, Router,
  extract::State,
  middleware,
  response::IntoResponse,
  routing::{get, patch},
};
use r2s_cache::Cache;
use r2s_cluster::{CHALLENGE_NS, Cluster};
use r2s_config::cluster;
use r2s_database::{config, user::Permission};
use r2s_engine::{DiagnosticMarker, Engine};
use r2s_event::{
  Event,
  events::{DevopsEvent, DevopsEventType, EventContainer},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

mod registry;

use crate::{
  middleware::auth::{self, Token},
  routes::game::lifecycle,
  traits::{GlobalState, ResponseError},
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  if state.config.cluster.as_ref().is_some_and(|c| c.enabled) {
    info!("Cluster feature is enabled, starting workers...");
    let cluster = state.cluster.clone();
    let queue = state.queue.clone();
    tokio::spawn(cluster_maintain_worker(state.clone(), cluster, queue));
  }
  Router::new()
    .merge(
      Router::new()
        .route("/config", get(get_cluster_config))
        .route("/node", get(get_cluster_nodes))
        .route(
          "/node-selector",
          patch(update_default_node_selector).delete(delete_default_node_selector),
        )
        .route(
          "/traffic",
          patch(update_traffic_script).delete(delete_traffic_script),
        )
        .route(
          "/lifecycle",
          patch(update_lifecycle_script).delete(delete_lifecycle_script),
        )
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::DevOps
        ))),
    )
    .nest("/registry", registry::router(state))
    .route("/calmdown", get(get_calmdown_status))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Basic,
      Permission::Verified
    )))
}

async fn cluster_maintain_worker(state: GlobalState, cluster: Cluster, queue: Queue) {
  info!("cluster maintain worker started");
  let mut overloaded = false;
  loop {
    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
    match cluster.at(CHALLENGE_NS).delete_outdated_envs().await {
      Ok(result) => {
        if !result.deleted.is_empty() {
          lifecycle::spawn_timeout_stop_hooks(state.clone(), result.deleted);
        }
        let o = result.overloaded;
        let running = result.running;
        let pending = result.pending;
        if o {
          warn!(?running, ?pending, "cluster is overloaded");
          let event = EventContainer {
            game_id: 0,
            event: Event::Devops(Box::new(DevopsEvent {
              event_type: DevopsEventType::ClusterOverloaded,
              running: Some(running as i64),
              pending: Some(pending as i64),
              message: Some(format!(
                "Cluster is overloaded: running={running}, pending={pending}"
              )),
            })),
          };
          queue.publish("event", event, "GLOBAL").await.ok();
        } else if !o && overloaded != o {
          info!(?running, ?pending, "cluster is recovered");
          let event = EventContainer {
            game_id: 0,
            event: Event::Devops(Box::new(DevopsEvent {
              event_type: DevopsEventType::ClusterRecovered,
              running: Some(running as i64),
              pending: Some(pending as i64),
              message: Some(format!(
                "Cluster is recovered: running={running}, pending={pending}"
              )),
            })),
          };
          queue.publish("event", event, "GLOBAL").await.ok();
        }
        overloaded = o;
      }
      Err(err) => error!(error=?err, "failed to delete outdated pods"),
    }
  }
}

async fn get_cluster_config(
  State(ref cluster): State<Cluster>,
) -> Result<impl IntoResponse, ResponseError> {
  let configs = cluster.configs().await?;
  Ok(Json(configs))
}

async fn get_cluster_nodes(
  State(ref cluster): State<Cluster>,
) -> Result<impl IntoResponse, ResponseError> {
  let nodes = cluster.nodes().await?;
  Ok(Json(nodes))
}
async fn get_calmdown_status(
  State(cache): State<Cache>, Extension(token): Extension<Token>,
) -> Result<impl IntoResponse, ResponseError> {
  let timestamp = cache.at("cluster").get::<i64>(token.id).await?;
  Ok(Json(timestamp))
}

#[derive(Deserialize)]
struct NodeSelector {
  node_selector: String,
}

async fn update_default_node_selector(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>,
  Json(NodeSelector { node_selector }): Json<NodeSelector>,
) -> Result<impl IntoResponse, ResponseError> {
  info!(%node_selector, "default node selector updated");
  config::update(
    &db.conn,
    config::Model {
      cluster: Some(cluster::Config {
        node_selector: Some(node_selector),
        ..config.cluster.unwrap_or_default()
      }),
      ..config
    },
  )
  .await?;
  cache.at("platform").del("config").await?;

  Ok(())
}

async fn delete_default_node_selector(
  State(ref db): State<Database>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  config::update(
    &db.conn,
    config::Model {
      cluster: Some(cluster::Config {
        node_selector: None,
        ..config.cluster.unwrap_or_default()
      }),
      ..config
    },
  )
  .await?;
  cache.at("platform").del("config").await?;

  info!("default node selector deleted");

  Ok(())
}

#[derive(Deserialize)]
struct TrafficScriptRequest {
  traffic: String,
}

#[derive(Deserialize)]
struct LifecycleScriptRequest {
  lifecycle: String,
}

#[derive(Serialize)]
struct ScriptResponse {
  pub lint: Vec<DiagnosticMarker>,
}

async fn update_traffic_script(
  State(ref cluster): State<Cluster>, State(cache): State<Cache>, State(ref db): State<Database>,
  State(engine): State<Engine>, Extension(config): Extension<config::Model>,
  Json(req): Json<TrafficScriptRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let traffic_mapper = cluster
    .traffic
    .clone()
    .ok_or(ResponseError::NotFound("traffic".to_string()))?;
  let lint = traffic_mapper.lint(&req.traffic).await?;

  config::update(
    &db.conn,
    config::Model {
      cluster: Some(cluster::Config {
        traffic: Some(req.traffic.clone()),
        ..config.cluster.unwrap_or_default()
      }),
      ..config
    },
  )
  .await?;
  traffic_mapper.expire(&engine, "default").await;
  cache.at("platform").del("config").await?;
  info!("default traffic script updated");
  Ok(Json(ScriptResponse { lint }))
}

async fn delete_traffic_script(
  State(ref cluster): State<Cluster>, State(cache): State<Cache>, State(ref db): State<Database>,
  State(engine): State<Engine>, Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let traffic_mapper = cluster
    .traffic
    .clone()
    .ok_or(ResponseError::NotFound("traffic".to_string()))?;
  config::update(
    &db.conn,
    config::Model {
      cluster: Some(cluster::Config {
        traffic: None,
        ..config.cluster.unwrap_or_default()
      }),
      ..config
    },
  )
  .await?;
  traffic_mapper.expire(&engine, "default").await;
  cache.at("platform").del("config").await?;

  info!("default traffic script deleted");

  Ok(())
}

async fn update_lifecycle_script(
  State(ref cluster): State<Cluster>, State(cache): State<Cache>, State(ref db): State<Database>,
  State(engine): State<Engine>, Extension(config): Extension<config::Model>,
  Json(req): Json<LifecycleScriptRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let lifecycle_mapper = cluster
    .lifecycle
    .clone()
    .ok_or(ResponseError::NotFound("lifecycle".to_string()))?;
  let lint = lifecycle_mapper.lint(&req.lifecycle).await?;

  config::update(
    &db.conn,
    config::Model {
      cluster: Some(cluster::Config {
        lifecycle: Some(req.lifecycle.clone()),
        ..config.cluster.unwrap_or_default()
      }),
      ..config
    },
  )
  .await?;
  lifecycle_mapper.expire(&engine, "default").await;
  cache.at("platform").del("config").await?;
  info!("default lifecycle script updated");
  Ok(Json(ScriptResponse { lint }))
}

async fn delete_lifecycle_script(
  State(ref cluster): State<Cluster>, State(cache): State<Cache>, State(ref db): State<Database>,
  State(engine): State<Engine>, Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let lifecycle_mapper = cluster
    .lifecycle
    .clone()
    .ok_or(ResponseError::NotFound("lifecycle".to_string()))?;
  config::update(
    &db.conn,
    config::Model {
      cluster: Some(cluster::Config {
        lifecycle: None,
        ..config.cluster.unwrap_or_default()
      }),
      ..config
    },
  )
  .await?;
  lifecycle_mapper.expire(&engine, "default").await;
  cache.at("platform").del("config").await?;

  info!("default lifecycle script deleted");

  Ok(())
}

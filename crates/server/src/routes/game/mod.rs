use axum::{
  Router,
  extract::DefaultBodyLimit,
  middleware,
  routing::{delete, get, patch, post},
};
use chrono::{DateTime, Utc, serde::ts_seconds};
use r2s_bucket::{Bucket, game::GameBucket};
use r2s_cluster::{Pod, traffic::MappedPort};
use r2s_database::{game, user::Permission};
use serde::{Deserialize, Serialize};

use crate::{
  middleware::{auth, data},
  traits::{GlobalState, ResponseError},
  worker,
};

mod admin;
mod challenge;
mod chat;
mod core;
pub(crate) mod hook;
pub(crate) mod lifecycle;
mod notification;
mod participant;
mod registry;
mod repo;
pub(crate) mod repo_sync;
mod runtime;
mod statistics;
mod team;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  tokio::spawn(worker::game::spawn_game_workers(state.clone()));
  Router::new()
    .route("/", post(core::create_game))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Host
    )))
    .nest(
      "/{game}",
      Router::new()
        .route(
          "/administrator",
          get(admin::get_game_administrator).patch(admin::update_game_administrator),
        )
        .route(
          "/traffic",
          patch(runtime::update_game_traffic).delete(runtime::delete_game_traffic),
        )
        .route(
          "/lifecycle",
          patch(runtime::update_game_lifecycle).delete(runtime::delete_game_lifecycle),
        )
        .route(
          "/node-selector",
          patch(runtime::update_game_node_selector).delete(runtime::delete_game_node_selector),
        )
        .nest(
          "/repo",
          Router::new().route("/", get(repo::get_game_repo_git)).nest(
            "/{repo}",
            Router::new()
              .route(
                "/git-upload-pack",
                post(repo::game_repo_git_upload_pack).options(repo::game_repo_git_upload_pack),
              )
              .route(
                "/git-receive-pack",
                post(repo::game_repo_git_receive_pack).options(repo::game_repo_git_receive_pack),
              )
              .route(
                "/info/refs",
                get(repo::game_repo_info_refs).options(repo::game_repo_info_refs),
              ),
          ),
        )
        .nest(
          "/registry",
          Router::new()
            .route("/config", get(registry::get_cluster_registry_config))
            .route("/refresh", delete(registry::refresh_cluster_registry))
            .route(
              "/",
              get(registry::get_cluster_registry_repo).post(registry::upload_image),
            )
            .route_layer(DefaultBodyLimit::max(2 * 1024 * 1024 * 1024))
            .route("/{image}", get(registry::get_cluster_registry_image)),
        )
        .route("/device", get(admin::get_connected_devices))
        .route("/token", post(admin::regenerate_game_token))
        .route("/doc/{doc}", patch(core::update_game_doc))
        .route("/introduction", patch(core::update_game_intro_compat))
        .route("/submission", get(admin::get_submissions))
        .nest(
          "/audit",
          Router::new()
            .route("/{audit}", patch(admin::update_audit))
            .route_layer(middleware::from_fn_with_state(
              state.clone(),
              data::prepare_data!(audit, false, id),
            ))
            .route("/", get(admin::get_audit_messages)),
        )
        .nest(
          "/statistics",
          Router::new()
            .route("/", get(statistics::get_game_statistics))
            .route("/export", get(statistics::export_statistics)),
        )
        .route("/", patch(core::update_game).delete(core::delete_game))
        .route_layer(middleware::from_fn(auth::game_admin_required))
        .route("/solve", get(participant::get_self_solves))
        .route("/instance", get(participant::get_self_instances))
        .nest("/challenge", challenge::router(state))
        .nest("/team", team::router(state))
        .nest("/notification", notification::router(state))
        .nest("/chat", chat::router(state))
        .route("/doc/{doc}", get(core::get_game_doc))
        .route("/introduction", get(core::redirect_game_intro_to_readme))
        .route("/", get(core::get_game))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_team_info,
        ))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(game, true, id, name),
        )),
    )
    .route("/", get(core::get_game_list))
}

pub(super) async fn get_game_bucket_mut(
  bucket: &Bucket, game: &game::Model,
) -> Result<GameBucket, ResponseError> {
  bucket
    .at_mut(
      &game
        .bucket
        .clone()
        .ok_or(ResponseError::InternalServerError(
          "bucket is not exist for this game".into(),
        ))
        .inspect_err(|err| {
          tracing::warn!(error=?err, "game does not have a valid bucket");
        })?,
    )
    .await
    .map_err(Into::into)
}

#[derive(Serialize, Clone, Deserialize)]
pub struct Instance {
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
        .map(|c| DateTime::from_timestamp_secs(c.0.as_second()).unwrap_or_default())
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

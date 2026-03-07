use std::{sync::Arc, time::Duration};

use axum::{
  Router,
  body::Body,
  error_handling::HandleErrorLayer,
  extract::State,
  http::{HeaderValue, Request, StatusCode},
  middleware::{from_fn, from_fn_with_state},
  response::{IntoResponse, Response},
  routing::get,
};
use r2s_config::server;
use tower::{ServiceBuilder, buffer::BufferLayer};
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};
use tower_http::{
  ServiceBuilderExt,
  cors::{Any, CorsLayer},
  request_id::RequestId,
  trace::TraceLayer,
};
use tracing::{Span, debug, error_span};

use crate::{
  middleware::{
    self,
    auth::{create_auth_header_by_user_agent, extract_user_info},
    codec,
    forwarded::{MakeRequestNanoId, ProxiedIpExtractor, ip_record},
  },
  traits::{GlobalState, ResponseError},
};

mod account;
mod bulletin;
mod calendar;
mod cluster;
mod event;
mod game;
mod media;
mod platform;
mod rpc;
mod traffic;
mod user;
mod wiki;

mod web;

pub async fn run_post_receive(
  session_id: &str, auth_key: &str, base_url: &str, repo_path: &std::path::Path,
) -> anyhow::Result<()> {
  game::hook::run_post_receive(session_id, auth_key, base_url, repo_path).await
}

pub async fn initialize(
  config: Option<server::Config>, state: GlobalState,
) -> anyhow::Result<Router> {
  let config = config.ok_or(anyhow::anyhow!("missing server config"))?;
  let api_base_path = &config.api_base_path;
  let cors_origins = &config.cors_origins;
  let api_router = construct_router(&state);
  let router = Router::new()
    .nest(api_base_path, api_router)
    .route_layer(from_fn_with_state(
      state.clone(),
      middleware::data::prepare_config,
    ))
    .layer(from_fn(codec::encrypt_stream_codec))
    .layer(
      CorsLayer::new()
        .allow_headers(Any)
        .allow_methods(Any)
        .allow_origin(
          cors_origins
            .parse::<HeaderValue>()
            .expect("invalid CORS origins"),
        ),
    )
    .merge(web::router(&state))
    .with_state::<()>(state);
  Ok(router)
}

fn construct_router(state: &GlobalState) -> Router<GlobalState> {
  let route = Router::new()
    .nest("/account", account::router(state))
    .nest("/bulletin", bulletin::router(state))
    .nest("/calendar", calendar::router(state))
    .nest("/event", event::router(state))
    .nest("/game", game::router(state))
    .nest("/internal", game::repo_sync::router())
    .nest("/cluster", cluster::router(state))
    .nest("/media", media::router(state))
    .nest("/platform", platform::router(state))
    .nest("/user", user::router(state))
    .nest("/wiki", wiki::router(state))
    .nest("/rpc", rpc::router(state))
    .nest("/traffic", traffic::router(state))
    .route("/ping", get(ping))
    .route_layer(from_fn_with_state(state.clone(), ip_record))
    .route_layer(from_fn_with_state(state.clone(), extract_user_info))
    .route_layer(from_fn(create_auth_header_by_user_agent))
    .layer(
      TraceLayer::new_for_http()
        .make_span_with(|request: &Request<Body>| {
          let trace = request.extensions().get::<RequestId>();
          let request_id = trace
            .map(|id| id.header_value().to_str().unwrap_or("UNKNOWN"))
            .unwrap_or_else(|| "UNKNOWN");
          error_span!(
            "request",
            method=%request.method(), uri=%request.uri().path(), trace=%request_id, from=tracing::field::Empty,
            "user-id"=tracing::field::Empty,
            "user-account"=tracing::field::Empty,
            "user-nickname"=tracing::field::Empty,
            "team-id"=tracing::field::Empty,
            "team-name"=tracing::field::Empty,
            "data-challenge-id"=tracing::field::Empty,
            "data-challenge-name"=tracing::field::Empty,
            "data-game-id"=tracing::field::Empty,
            "data-game-name"=tracing::field::Empty,
            "data-team-id"=tracing::field::Empty,
            "data-team-name"=tracing::field::Empty,
            "data-user-id"=tracing::field::Empty,
            "data-user-account"=tracing::field::Empty,
            "data-user-nickname"=tracing::field::Empty,
            "data-notification-id"=tracing::field::Empty,
            "data-notification-title"=tracing::field::Empty,
            "data-audit-id"=tracing::field::Empty,
            "data-institute-id"=tracing::field::Empty,
            "data-institute-name"=tracing::field::Empty,

          )
        })
        .on_request(())
        .on_response(|response: &Response, latency: Duration, _span: &Span| {
          debug!(response = ?response.status(), latency = ?format!("{}ms", latency.as_millis()));
        }),
    );

  let route = if let Some(config) = state.config.server.clone().unwrap_or_default().rate_limit {
    let governor_conf = Arc::new(
      GovernorConfigBuilder::default()
        .per_millisecond(config.burst_restore_rate.unwrap_or(500))
        .burst_size(config.burst_limit.unwrap_or(32))
        .key_extractor(ProxiedIpExtractor)
        .use_headers()
        .finish()
        .unwrap(),
    );

    let governor_limiter = governor_conf.limiter().clone();
    let interval = Duration::from_secs(60);
    // a separate background task to clean up
    tokio::spawn(async move {
      loop {
        tokio::time::sleep(interval).await;
        debug!(size = ?governor_limiter.len(), "rate limiting storage");
        governor_limiter.retain_recent();
      }
    });

    route.layer(GovernorLayer::new(governor_conf))
  } else {
    route
  };

  route.layer(
    ServiceBuilder::new()
      .set_x_request_id(MakeRequestNanoId)
      .propagate_x_request_id()
      .layer(HandleErrorLayer::new(|err: tower::BoxError| async move {
        (
          StatusCode::INTERNAL_SERVER_ERROR,
          format!("unhandled error: {err}"),
        )
      }))
      .layer(BufferLayer::new(1024)),
  )
}

async fn ping(State(state): State<GlobalState>) -> Result<impl IntoResponse, ResponseError> {
  state.db.conn.ping().await?;
  state.cache.ping().await?;
  if state.queue.context().client().connection_state() != async_nats::connection::State::Connected {
    return Err(ResponseError::InternalServerError(
      "queue not connected".to_owned(),
    ));
  }

  Ok("pong")
}

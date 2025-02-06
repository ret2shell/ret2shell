use std::{net::IpAddr, sync::Arc, time::Duration};

use axum::{
  body::Body,
  error_handling::HandleErrorLayer,
  http::{HeaderValue, Request, StatusCode},
  middleware::{from_fn, from_fn_with_state},
  response::{IntoResponse, Response},
  routing::get,
  Router,
};
use r2s_config::server;
use tower::{buffer::BufferLayer, ServiceBuilder};
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::{
  cors::{Any, CorsLayer},
  trace::TraceLayer,
};
use tracing::{debug, debug_span, Span};

use crate::{
  middleware::{
    self,
    auth::extract_user_info,
    codec,
    forwarded::{ip_record, ip_record_worker, ProxiedIpExtractor},
  },
  traits::GlobalState,
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

mod proxy;

pub async fn initialize(
  config: Option<server::Config>, state: GlobalState,
) -> anyhow::Result<Router> {
  let config = config.ok_or(anyhow::anyhow!("missing server config"))?;
  let api_base_path = &config.api_base_path;
  let cors_origins = &config.cors_origins;
  let ip_record_stream = state.queue.subscribe("ip-record").await?;
  let db = state.db.clone();
  tokio::spawn(async move { ip_record_worker(ip_record_stream, db).await });
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
    .merge(proxy::router(&state))
    .layer(
      TraceLayer::new_for_http()
        .make_span_with(|request: &Request<Body>| {
          let ip = middleware::forwarded::get_client_ip(request)
            .unwrap_or(IpAddr::V4("0.0.0.0".parse().unwrap()));
          debug_span!("http",
              from = %ip.to_string(),
              method = %request.method(),
              uri = %request.uri().path(),
          )
        })
        .on_request(())
        .on_response(|response: &Response, latency: Duration, _span: &Span| {
          debug!("[{}] in {}ms", response.status(), latency.as_millis());
        }),
    )
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
    .nest("/cluster", cluster::router(state))
    .nest("/media", media::router(state))
    .nest("/platform", platform::router(state))
    .nest("/user", user::router(state))
    .nest("/wiki", wiki::router(state))
    .nest("/rpc", rpc::router(state))
    .nest("/traffic", traffic::router(state))
    .route("/ping", get(ping))
    .route_layer(from_fn_with_state(state.clone(), ip_record))
    .route_layer(from_fn_with_state(state.clone(), extract_user_info));

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
        debug!("rate limiting storage size: {}", governor_limiter.len());
        governor_limiter.retain_recent();
      }
    });

    route.layer(GovernorLayer {
      config: governor_conf,
    })
  } else {
    route
  };

  route.layer(
    ServiceBuilder::new()
      .layer(HandleErrorLayer::new(|err: tower::BoxError| async move {
        (
          StatusCode::INTERNAL_SERVER_ERROR,
          format!("unhandled error: {}", err),
        )
      }))
      .layer(BufferLayer::new(1024)),
  )
}

async fn ping() -> impl IntoResponse {
  "pong"
}

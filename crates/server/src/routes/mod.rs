use std::{net::IpAddr, time::Duration};

use axum::{
    body::Body,
    http::{HeaderValue, Request},
    middleware::from_fn_with_state,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use r2s_config::server;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::{debug, debug_span, Span};

use crate::{
    middleware::{
        self,
        auth::extract_user_info,
        forwarded::{ip_record, ip_record_worker},
    },
    traits::GlobalState,
};

mod account;
mod automate;
mod bulletin;
mod calendar;
mod cluster;
mod game;
mod media;
mod platform;
mod rpc;
mod traffic;
mod user;
mod wiki;
mod worker;

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
    Router::new()
        .nest("/account", account::router(state))
        .nest("/automate", automate::router(state))
        .nest("/bulletin", bulletin::router(state))
        .nest("/calendar", calendar::router(state))
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
        .route_layer(from_fn_with_state(state.clone(), extract_user_info))
}

async fn ping() -> impl IntoResponse {
    "pong"
}

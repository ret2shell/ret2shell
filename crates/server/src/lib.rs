use std::{io::Write, net::SocketAddr, process};

use axum::{ServiceExt, extract::Request};
use hyper_util::{client::legacy::connect::HttpConnector, rt::TokioExecutor};
use owo_colors::OwoColorize;
use r2s_config::GlobalConfig;
use r2s_event::{
  Event,
  events::{DevopsEvent, DevopsEventType, EventContainer},
};
use rustls::crypto;
use tokio::signal;
use tower_http::normalize_path::NormalizePath;
use tracing::{error, info, warn};

use crate::traits::GlobalState;

mod logger;
mod middleware;
mod routes;
mod traits;
mod utility;
mod worker;

const PUB_KEY: &[u8] = include_bytes!("../../../config/pub.bin");
include!(concat!(env!("OUT_DIR"), "/constants.rs"));

/// Show greet information.
pub fn greet() {
  println!(
    "[START UP] {} {}",
    "Ret 2 Shell".bold(),
    R2S_FULL_VERSION.dimmed()
  );
  println!(
    "----------------------------- {} -----------------------------",
    "server log starts here".to_uppercase().bold()
  );
}

pub use routes::run_post_receive;

pub async fn up(config: GlobalConfig) -> anyhow::Result<()> {
  let guards = logger::initialize(&config.logging).await?;
  info!(">> server initialization started <<");
  let license = match r2s_license::check_license(PUB_KEY) {
    Ok(license) => license,
    Err(err) => {
      error!("license check failed: {}", err.to_string().red());
      error!("please contact tech support <support@ret.sh.cn>.");
      return Err(err.into());
    }
  };

  info!(
    "[{:?}] Licensed to {} ({}), will expire at {}",
    license.level, license.issuer, license.website, license.date
  );

  match crypto::aws_lc_rs::default_provider().install_default() {
    Ok(_) => info!("using `AWS Libcrypto` as default crypto backend."),
    Err(err) => {
      error!("`AWS Libcrypto` is not available: {:?}", err);
      warn!("try to use `ring` as default crypto backend.");
      crypto::ring::default_provider()
        .install_default()
        .inspect_err(|err| {
          error!("`ring` is not available: {:?}", err);
          error!("All crypto backend are not available, exiting...");
          process::exit(1);
        })
        .ok();
      info!("using `ring` as default crypto backend.");
    }
  }
  info!("loading module: < Auditor >");
  let auditor = r2s_auditor::initialize(&config.auditor).await?;
  info!("loading module: < Engine >");
  let engine = r2s_engine::initialize();
  info!("loading module: < Database >");
  let (db, migrated) = r2s_migrator::initialize(&config.database).await?;
  info!("loading module: < Cache >");
  let cache = r2s_cache::initialize(&config.cache, Some(migrated)).await?;
  info!("loading module: < Bucket >");
  let bucket = r2s_bucket::initialize(&config.bucket).await?;
  info!("loading module: < Message Queue >");
  let queue = r2s_queue::initialize(&config.queue).await?;
  info!("loading module: < Event Manager >");
  let event = r2s_event::initialize();
  info!("loading module: < OAuth >");
  let oauth = r2s_oauth::initialize(&config.auth).await;
  info!("loading module: < Cluster >");
  let cluster = r2s_cluster::initialize(&config.cluster).await?;
  info!("loading module: < Media Storage >");
  let media = r2s_media::initialize(&config.media).await?;
  info!("loading module: < Checker >");
  let checker = r2s_checker::initialize().await;
  info!("starting workers: < Email Worker >");
  worker::email::spawn(queue.subscribe("email").await?, db.clone());
  info!("starting workers: < Event Worker >");
  worker::event::spawn(queue.subscribe("event").await?, event.clone(), db.clone());
  info!("starting workers: < IP Record Worker >");
  worker::ip_record::spawn(queue.subscribe("ip-record").await?, db.clone());

  info!("setup panic event handler...");
  push_panic_event(queue.clone()).await;

  let state = GlobalState {
    config: config.clone(),
    requestor: hyper_util::client::legacy::Client::<(), ()>::builder(TokioExecutor::new())
      .build(HttpConnector::new()),
    db,
    cache,
    auditor,
    bucket,
    engine,
    event,
    queue,
    oauth,
    license,
    cluster,
    checker,
    media,
    version: R2S_VERSION.to_string(),
  };
  info!("modules loaded, constructing router...");

  let router = routes::initialize(config.server.clone(), state.clone()).await?;
  let router = NormalizePath::trim_trailing_slash(router);
  info!("router constructed.");

  info!(">> server initialization finished <<");

  info!("starting server...");

  let server_config = config
    .server
    .ok_or(anyhow::anyhow!("server configuration not found"))?;

  let addr_str = format!("{}:{}", &server_config.host, &server_config.port);

  let addr = tokio::net::TcpListener::bind(addr_str.clone())
    .await
    .expect("failed to bind server address");
  info!("高性能ですから! (∠・ω< )⌒☆");
  info!("server started at [ {} ]", addr_str);
  axum::serve(
    addr,
    ServiceExt::<Request>::into_make_service_with_connect_info::<SocketAddr>(router),
  )
  .with_graceful_shutdown(shutdown_signal(state))
  .await
  .expect("failed to start server.");

  drop(guards);
  Ok(())
}

pub async fn down(config: GlobalConfig) -> anyhow::Result<()> {
  println!(
    "{}",
    "WARNING: this operation will drop all your data!"
      .bold()
      .bright_red()
  );
  println!(
    "{}",
    "Please only run it on development server."
      .bold()
      .bright_red()
  );
  print!(
    "Are you sure to continue? [{}/{}]: ",
    "I am sure to do that".red(),
    "NO".bold().green()
  );
  std::io::stdout().flush()?;
  let mut input = String::new();
  std::io::stdin().read_line(&mut input)?;
  if !input.trim().to_lowercase().eq("i am sure to do that") {
    warn!("cleanup aborted");
    return Ok(());
  }
  let guards = logger::initialize(&config.logging).await?;
  warn!(">> server cleanup started <<");
  r2s_migrator::down(&config.database).await?;
  info!("cleanup done: < Database >");
  r2s_cache::down(&config.cache).await?;
  info!("cleanup done: < Cache >");
  r2s_bucket::down(&config.bucket).await?;
  info!("cleanup done: < Bucket >");

  warn!(">> server cleanup finished <<");

  drop(guards);
  Ok(())
}

async fn push_panic_event(queue: r2s_queue::Queue) {
  std::panic::set_hook(Box::new(move |panic| {
    if let Some(location) = panic.location() {
      error!(
          message = %panic,
          panic.file = location.file(),
          panic.line = location.line(),
          panic.column = location.column(),
      );
      let event = EventContainer {
        game_id: 0,
        event: Event::Devops(Box::new(DevopsEvent {
          event_type: DevopsEventType::ServerPanic,
          running: None,
          pending: None,
          message: Some(format!(
            "Panic at: file={}, line={}:{}, message={}",
            location.file(),
            location.line(),
            location.column(),
            panic
          )),
        })),
      };
      let queue = queue.clone();
      tokio::spawn(async move {
        queue.publish("event", event, "GLOBAL").await.ok();
      });
    } else {
      error!(message = %panic);
      let event = EventContainer {
        game_id: 0,
        event: Event::Devops(Box::new(DevopsEvent {
          event_type: DevopsEventType::ServerPanic,
          running: None,
          pending: None,
          message: Some(format!("Panic at: {panic}")),
        })),
      };
      let queue = queue.clone();
      tokio::spawn(async move {
        queue.publish("event", event, "GLOBAL").await.ok();
      });
    }
  }));
}

async fn shutdown_signal(_state: GlobalState) {
  let ctrl_c = async {
    signal::ctrl_c()
      .await
      .expect("failed to install Ctrl+C handler");
  };

  #[cfg(unix)]
  let terminate = async {
    signal::unix::signal(signal::unix::SignalKind::terminate())
      .expect("failed to install signal handler")
      .recv()
      .await;
  };

  #[cfg(not(unix))]
  let terminate = std::future::pending::<()>();

  tokio::select! {
      _ = ctrl_c => {
          info!("termination `Ctrl+C` received, shutting down...");
          std::process::exit(0);
      },
      _ = terminate => {
          info!("termination signal received, shutting down...");
          std::process::exit(0);
      },
  }
}

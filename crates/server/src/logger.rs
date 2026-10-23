//! This module setup the logger of `tracing`.
//!
//! In the initialization stage, the log writer will be guarded by their file
//! descriptor, the lifetime of the file descriptor is the same as the log
//! writer. You should keep the file descriptor until application exit.

use std::{
  collections::HashMap,
  io::{Result as IoResult, Write},
  path::{Path, PathBuf},
  time::Duration,
};

use axum::{body::Body, http::Request};
use chrono::{Datelike, Utc};
use flate2::{Compression, write::GzEncoder};
use hyper_util::{
  client::legacy::{Client, connect::HttpConnector},
  rt::TokioExecutor,
};
use r2s_config::logging;
use tar::Builder as TarBuilder;
use thiserror::Error;
use tokio::{
  sync::mpsc,
  task::spawn_blocking,
  time::{MissedTickBehavior, interval},
};
use tracing::error;
use tracing_appender::{non_blocking, non_blocking::WorkerGuard, rolling};
use tracing_subscriber::{
  EnvFilter,
  fmt::{Layer, MakeWriter},
  prelude::*,
};

#[derive(Error, Debug)]
pub enum LoggerError {
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("file logger init error")]
  FileLoggerInitError(#[from] rolling::InitError),
}

// A MakeWriter that provides a per-event writer, which pushes complete JSON
// lines to a background worker.
#[derive(Clone)]
struct VlMakeWriter {
  tx: mpsc::Sender<Vec<u8>>,
}

impl VlMakeWriter {
  fn new(tx: mpsc::Sender<Vec<u8>>) -> Self {
    Self { tx }
  }
}

struct VlLineWriter {
  tx: mpsc::Sender<Vec<u8>>,
  buf: Vec<u8>,
}

impl Write for VlLineWriter {
  fn write(&mut self, buf: &[u8]) -> IoResult<usize> {
    // tracing-subscriber JSON formatter writes one JSON object per
    // event/span-event, typically ending with '\n'. We split on newlines and
    // send complete lines.
    self.buf.extend_from_slice(buf);

    while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
      let mut line = self.buf.drain(..=pos).collect::<Vec<u8>>();
      if !line.ends_with(b"\n") {
        line.push(b'\n');
      }
      // Backpressure: block if full to avoid dropping logs
      if let Err(e) = self.tx.blocking_send(line) {
        error!(error=?e, "failed to enqueue log line for victoria logs server");
      }
    }

    Ok(buf.len())
  }

  fn flush(&mut self) -> IoResult<()> {
    if !self.buf.is_empty() {
      let mut line = self.buf.split_off(0);
      if !line.ends_with(b"\n") {
        line.push(b'\n');
      }
      if let Err(e) = self.tx.blocking_send(line) {
        error!(
          error=?e,
          "failed to enqueue partial log line for victoria logs server",
        );
      }
    }
    Ok(())
  }
}

impl<'a> MakeWriter<'a> for VlMakeWriter {
  type Writer = VlLineWriter;

  fn make_writer(&'a self) -> Self::Writer {
    VlLineWriter {
      tx: self.tx.clone(),
      buf: Vec::with_capacity(1024),
    }
  }
}

// Background task that batches and POSTs ndjson to VictoriaLogs via hyper_util
// legacy client
async fn run_vl_worker(
  mut rx: mpsc::Receiver<Vec<u8>>, url: String, client: Client<HttpConnector, Body>,
) {
  let mut ticker = interval(Duration::from_secs(5));
  ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

  let mut body: Vec<u8> = Vec::with_capacity(4096);
  let mut lines = 0usize;

  let flush = |mut body: Vec<u8>| async {
    if body.is_empty() {
      return;
    }
    // Ensure final body ends with a newline (VictoriaLogs accepts NDJSON lines)
    if !body.ends_with(b"\n") {
      body.extend_from_slice(b"\n");
    }

    let mut builder = Request::builder().method("POST").uri(format!(
      "{}/insert/jsonline?_time_field=timestamp&_msg_field=fields.message",
      url
    ));

    // Content-Type is text/plain for NDJSON; application/stream+json also works
    builder = builder.header("Content-Type", "application/stream+json");

    let body = Body::from(body);

    let req = match builder.body(body) {
      Ok(r) => r,
      Err(err) => {
        error!(error=?err, "failed to build request for victoria logs server");
        return;
      }
    };

    // Send and consume the response body to allow connection reuse
    match client.request(req).await {
      Ok(resp) => {
        if !resp.status().is_success() {
          error!(
            ?resp,
            "remote victoria logs server returned non-success status"
          );
        }
      }
      Err(err) => {
        error!(error=?err, "failed to POST batch");
      }
    }
  };

  loop {
    tokio::select! {
        maybe_line = rx.recv() => {
            match maybe_line {
                Some(mut line) => {
                    if !line.ends_with(b"\n") {
                        line.push(b'\n');
                    }
                    body.extend_from_slice(&line);
                    lines += 1;

                    if body.len() >= 3072 || lines >= 100 {
                        flush(body).await;
                        body = Vec::with_capacity(4096);
                        lines = 0;
                    }
                }
                None => {
                    flush(body).await;
                    break;
                }
            }
        }
        _ = ticker.tick() => {
            flush(body).await;
            body = Vec::with_capacity(4096);
            lines = 0;
        }
    }
  }
}

#[derive(Default)]
struct LogInventory {
  daily: HashMap<(i32, u32), Vec<PathBuf>>, // (year, month) -> daily files
  monthly: HashMap<(i32, u32), PathBuf>,    // (year, month) -> archive path
  yearly: HashMap<i32, PathBuf>,            // year -> archive path
}

fn parse_daily_log(name: &str) -> Option<(i32, u32, u32)> {
  if !name.starts_with("ret2shell.") || !name.ends_with(".log") {
    return None;
  }
  if name.ends_with(".log.tar.gz") {
    return None;
  }
  let middle = &name["ret2shell.".len()..name.len() - ".log".len()];
  let mut parts = middle.split('-');
  let year = parts.next()?.parse::<i32>().ok()?;
  let month = parts.next()?.parse::<u32>().ok()?;
  let day = parts.next()?.parse::<u32>().ok()?;
  if parts.next().is_some() {
    return None;
  }
  Some((year, month, day))
}

fn parse_monthly_archive(name: &str) -> Option<(i32, u32)> {
  if !name.starts_with("ret2shell.") || !name.ends_with(".log.tar.gz") {
    return None;
  }
  let middle = &name["ret2shell.".len()..name.len() - ".log.tar.gz".len()];
  let mut parts = middle.split('-');
  let year = parts.next()?.parse::<i32>().ok()?;
  let month = parts.next()?.parse::<u32>().ok()?;
  if parts.next().is_some() {
    return None;
  }
  Some((year, month))
}

fn parse_yearly_archive(name: &str) -> Option<i32> {
  if !name.starts_with("ret2shell.") || !name.ends_with(".log.tar.gz") {
    return None;
  }
  let middle = &name["ret2shell.".len()..name.len() - ".log.tar.gz".len()];
  if middle.contains('-') {
    return None;
  }
  middle.parse::<i32>().ok()
}

async fn collect_log_inventory(directory: &Path) -> IoResult<LogInventory> {
  let mut inventory = LogInventory::default();
  let mut dir = tokio::fs::read_dir(directory).await?;

  while let Some(entry) = dir.next_entry().await? {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
      continue;
    };
    if let Some((year, month, _day)) = parse_daily_log(name) {
      inventory.daily.entry((year, month)).or_default().push(path);
      continue;
    }
    if let Some((year, month)) = parse_monthly_archive(name) {
      inventory.monthly.insert((year, month), path);
      continue;
    }
    if let Some(year) = parse_yearly_archive(name) {
      inventory.yearly.insert(year, path);
    }
  }

  Ok(inventory)
}

fn build_monthly_archive_path(directory: &Path, year: i32, month: u32) -> PathBuf {
  directory.join(format!("ret2shell.{year:04}-{month:02}.log.tar.gz"))
}

fn build_yearly_archive_path(directory: &Path, year: i32) -> PathBuf {
  directory.join(format!("ret2shell.{year:04}.log.tar.gz"))
}

fn create_tar_gz(archive_path: &Path, files: &[PathBuf]) -> IoResult<()> {
  let file = std::fs::File::create(archive_path)?;
  let encoder = GzEncoder::new(file, Compression::default());
  let mut builder = TarBuilder::new(encoder);
  for path in files {
    if let Some(name) = path.file_name() {
      builder.append_path_with_name(path, name)?;
    }
  }
  let encoder = builder.into_inner()?;
  encoder.finish()?;
  Ok(())
}

async fn archive_and_cleanup(archive_path: PathBuf, files: Vec<PathBuf>) -> IoResult<()> {
  if files.is_empty() {
    return Ok(());
  }
  let files_for_blocking = files.clone();
  let archive_for_blocking = archive_path.clone();
  spawn_blocking(move || create_tar_gz(&archive_for_blocking, &files_for_blocking)).await??;
  spawn_blocking(move || {
    for path in files {
      let _ = std::fs::remove_file(path);
    }
    IoResult::Ok(())
  })
  .await??;
  Ok(())
}

async fn cleanup_files(files: Vec<PathBuf>) -> IoResult<()> {
  if files.is_empty() {
    return Ok(());
  }
  spawn_blocking(move || {
    for path in files {
      let _ = std::fs::remove_file(path);
    }
    IoResult::Ok(())
  })
  .await??;
  Ok(())
}

async fn compress_logs_once(directory: &Path) -> IoResult<()> {
  let inventory = collect_log_inventory(directory).await?;
  let now = Utc::now();
  let current_year = now.year();
  let current_month = now.month();

  // First: compress all daily logs outside current month into monthly archives.
  for ((year, month), daily_files) in &inventory.daily {
    if *year == current_year && *month == current_month {
      continue;
    }

    if inventory.monthly.contains_key(&(*year, *month)) {
      cleanup_files(daily_files.clone()).await?;
      continue;
    }

    let archive_path = build_monthly_archive_path(directory, *year, *month);
    archive_and_cleanup(archive_path, daily_files.clone()).await?;
  }

  // Refresh inventory to include newly created monthly archives.
  let inventory = collect_log_inventory(directory).await?;

  let mut years: Vec<i32> = inventory
    .daily
    .keys()
    .map(|(year, _)| *year)
    .chain(inventory.monthly.keys().map(|(year, _)| *year))
    .chain(inventory.yearly.keys().copied())
    .collect();
  years.sort();
  years.dedup();

  // Then: compress full past years (not current year) into yearly archives.
  for year in years {
    if year >= current_year {
      continue;
    }

    let yearly_exists = inventory.yearly.contains_key(&year);
    let mut files = Vec::new();

    for ((y, _month), path) in &inventory.monthly {
      if *y == year {
        files.push(path.clone());
      }
    }

    for ((y, _m), daily_files) in &inventory.daily {
      if *y == year {
        files.extend(daily_files.iter().cloned());
      }
    }

    if yearly_exists {
      cleanup_files(files).await?;
      continue;
    }

    if !files.is_empty() {
      let archive_path = build_yearly_archive_path(directory, year);
      archive_and_cleanup(archive_path, files).await?;
    }
  }

  Ok(())
}

async fn run_log_compress_worker(directory: PathBuf) {
  if let Err(err) = compress_logs_once(&directory).await {
    error!(error=?err, "failed to compress log archives");
  }

  let mut ticker = interval(Duration::from_secs(6 * 60 * 60));
  ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
  loop {
    ticker.tick().await;
    if let Err(err) = compress_logs_once(&directory).await {
      error!(error=?err, "failed to compress log archives");
    }
  }
}

/// Initialize the logger.
pub async fn initialize(config: &Option<logging::Config>) -> Result<Vec<WorkerGuard>, LoggerError> {
  let config = config.clone().unwrap_or(logging::Config {
    level: "info".to_string(),
    directory: "./log".to_string(),
    files_kept: None,
    compress: Some(false),
    victoria: None,
  });
  let logging::Config {
    level,
    directory,
    files_kept,
    compress: _,
    victoria,
  } = config;
  tokio::fs::create_dir_all(&directory).await?;
  let log_directory = PathBuf::from(directory.clone());
  tokio::spawn(async move { run_log_compress_worker(log_directory).await });
  let mut file_appender = rolling::RollingFileAppender::builder()
    .rotation(rolling::Rotation::DAILY)
    .filename_prefix("ret2shell")
    .filename_suffix("log");
  if let Some(files_kept) = files_kept {
    file_appender = file_appender.max_log_files(files_kept);
  }
  let file_appender = file_appender.build(Path::new(&directory).canonicalize()?)?;

  let (non_blocking_file, file_guard) = non_blocking(file_appender);
  let (non_blocking_console, console_guard) = non_blocking(std::io::stdout());
  let file_log_layer = Layer::new()
    .with_writer(non_blocking_file)
    .with_ansi(false)
    .with_target(true)
    .with_level(true)
    .with_thread_ids(false)
    .with_thread_names(false)
    .json();

  let console_log_layer = Layer::new()
    .with_writer(non_blocking_console)
    .with_ansi(true)
    .with_target(true)
    .with_level(true)
    .with_thread_ids(false)
    .with_thread_names(false);

  if let Some(victoria_url) = victoria {
    let client: Client<_, Body> = Client::builder(TokioExecutor::new()).build(HttpConnector::new());

    let (tx, rx) = mpsc::channel::<Vec<u8>>(64_000);
    // Spawn background worker
    let worker_client = client.clone();
    tokio::spawn(async move { run_vl_worker(rx, victoria_url, worker_client).await });

    // Hook tracing to VictoriaLogs writer (as a Layer so we can flatten events
    // and add span events)
    let make_writer = VlMakeWriter::new(tx);
    let (non_blocking_victoria, victoria_guard) = non_blocking(make_writer.make_writer());
    let victoria_log_layer = Layer::new()
      .with_writer(non_blocking_victoria)
      .with_ansi(false)
      .with_target(true)
      .with_level(true)
      .with_thread_ids(false)
      .with_thread_names(false)
      .json();
    tracing_subscriber::registry()
      .with(EnvFilter::new(level))
      .with(file_log_layer)
      .with(console_log_layer)
      .with(victoria_log_layer)
      .init();
    Ok(vec![console_guard, file_guard, victoria_guard])
  } else {
    tracing_subscriber::registry()
      .with(EnvFilter::new(level))
      .with(file_log_layer)
      .with(console_log_layer)
      .init();
    Ok(vec![console_guard, file_guard])
  }
}

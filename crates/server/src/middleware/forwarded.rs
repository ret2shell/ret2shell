use std::{
  net::{IpAddr, SocketAddr},
  str::FromStr,
};

use async_nats::jetstream::{self, consumer::pull::Stream};
use axum::{
  extract::{ConnectInfo, Request, State},
  http::{header::FORWARDED, HeaderMap},
  middleware::Next,
  response::IntoResponse,
  Extension,
};
use futures::StreamExt;
use r2s_database::ip;
use r2s_migrator::Database;
use r2s_queue::Queue;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tower_governor::{key_extractor::KeyExtractor, GovernorError};
use tracing::{debug, error, warn};

use super::auth::Token;
use crate::traits::ResponseError;

const X_REAL_IP: &str = "x-real-ip";
const X_FORWARDED_FOR: &str = "x-forwarded-for";

/// Tries to parse the `x-forwarded-for` header
fn maybe_x_forwarded_for(headers: &HeaderMap) -> Option<IpAddr> {
  headers
    .get(X_FORWARDED_FOR)
    .and_then(|hv| hv.to_str().ok())
    .and_then(|s| s.split(',').find_map(|s| s.trim().parse::<IpAddr>().ok()))
}

/// Tries to parse the `x-real-ip` header
fn maybe_x_real_ip(headers: &HeaderMap) -> Option<IpAddr> {
  headers
    .get(X_REAL_IP)
    .and_then(|hv| hv.to_str().ok())
    .and_then(|s| s.parse::<IpAddr>().ok())
}

/// Tries to parse `forwarded` headers
fn maybe_forwarded(headers: &HeaderMap) -> Option<IpAddr> {
  headers.get_all(FORWARDED).iter().find_map(|hv| {
    hv.to_str()
      .ok()
      .and_then(|s| ForwardedHeaderValue::from_forwarded(s).ok())
      .and_then(|f| {
        f.values
          .iter()
          .filter_map(|fs| fs.forwarded_for.as_ref())
          .find_map(|ff| match ff {
            Identifier::SocketAddr(a) => Some(a.ip()),
            Identifier::IpAddr(ip) => Some(*ip),
            _ => None,
          })
      })
  })
}

/// Looks in `ConnectInfo` extension
fn maybe_connect_info<B>(req: &Request<B>) -> Option<IpAddr> {
  req
    .extensions()
    .get::<ConnectInfo<SocketAddr>>()
    .map(|ConnectInfo(addr)| addr.ip())
}

#[derive(PartialEq, Eq, Clone, Copy)]
pub enum Protocol {
  Http,
  Https,
}

impl FromStr for Protocol {
  type Err = ForwardedHeaderValueParseError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s.to_ascii_lowercase().as_str() {
      "http" => Ok(Protocol::Http),
      "https" => Ok(Protocol::Https),
      _ => Err(ForwardedHeaderValueParseError::InvalidProtocol),
    }
  }
}

#[derive(PartialEq, Eq, Clone)]
pub enum Identifier {
  SocketAddr(SocketAddr),
  IpAddr(IpAddr),
  String(String),
  Unknown,
}

impl FromStr for Identifier {
  type Err = ForwardedHeaderValueParseError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    let s = s.trim().trim_matches('"').trim_matches('\'');
    if s == "unknown" {
      return Ok(Identifier::Unknown);
    }
    if let Ok(socket_addr) = s.parse::<SocketAddr>() {
      Ok(Identifier::SocketAddr(socket_addr))
    } else if let Ok(ip_addr) = s.parse::<IpAddr>() {
      Ok(Identifier::IpAddr(ip_addr))
    } else if s.starts_with('[') && s.ends_with(']') {
      if let Ok(ip_addr) = s[1..(s.len() - 1)].parse::<IpAddr>() {
        Ok(Identifier::IpAddr(ip_addr))
      } else {
        Err(ForwardedHeaderValueParseError::InvalidAddress)
      }
    } else if s.starts_with('_') {
      Ok(Identifier::String(s.to_string()))
    } else {
      Err(ForwardedHeaderValueParseError::InvalidObfuscatedNode(
        s.to_string(),
      ))
    }
  }
}

#[derive(Default)]
struct ForwardedStanza {
  pub forwarded_by: Option<Identifier>,
  pub forwarded_for: Option<Identifier>,
  pub forwarded_host: Option<String>,
  pub forwarded_proto: Option<Protocol>,
}

impl FromStr for ForwardedStanza {
  type Err = ForwardedHeaderValueParseError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    let mut rv = ForwardedStanza::default();
    let s = s.trim();
    for part in s.split(';') {
      let part = part.trim();
      if part.is_empty() {
        continue;
      }
      if let Some((key, value)) = part.split_once('=') {
        match key.to_ascii_lowercase().as_str() {
          "by" => rv.forwarded_by = Some(value.parse()?),
          "for" => rv.forwarded_for = Some(value.parse()?),
          "host" => {
            rv.forwarded_host = {
              if value.starts_with('"') && value.ends_with('"') {
                Some(
                  value[1..(value.len() - 1)]
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\"),
                )
              } else {
                Some(value.to_string())
              }
            }
          }
          "proto" => rv.forwarded_proto = Some(value.parse()?),
          _other => continue,
        }
      } else {
        return Err(ForwardedHeaderValueParseError::InvalidPart(part.to_owned()));
      }
    }
    Ok(rv)
  }
}

#[allow(dead_code)]
struct ForwardedHeaderValueIterator<'a> {
  head: Option<&'a ForwardedStanza>,
  tail: &'a [ForwardedStanza],
}

impl<'a> Iterator for ForwardedHeaderValueIterator<'a> {
  type Item = &'a ForwardedStanza;

  fn next(&mut self) -> Option<Self::Item> {
    if let Some(head) = self.head.take() {
      Some(head)
    } else if let Some((first, rest)) = self.tail.split_first() {
      self.tail = rest;
      Some(first)
    } else {
      None
    }
  }
}

impl DoubleEndedIterator for ForwardedHeaderValueIterator<'_> {
  fn next_back(&mut self) -> Option<Self::Item> {
    if let Some((last, rest)) = self.tail.split_last() {
      self.tail = rest;
      Some(last)
    } else if let Some(head) = self.head.take() {
      Some(head)
    } else {
      None
    }
  }
}

impl ExactSizeIterator for ForwardedHeaderValueIterator<'_> {
  fn len(&self) -> usize {
    self.tail.len() + usize::from(self.head.is_some())
  }
}

impl core::iter::FusedIterator for ForwardedHeaderValueIterator<'_> {}

fn values_from_header(header_value: &str) -> impl Iterator<Item = &str> {
  header_value.trim().split(',').filter_map(|i| {
    let trimmed = i.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed)
    }
  })
}

struct ForwardedHeaderValue {
  values: Vec<ForwardedStanza>,
}

impl ForwardedHeaderValue {
  pub fn from_forwarded(header_value: &str) -> Result<Self, ForwardedHeaderValueParseError> {
    values_from_header(header_value)
      .map(|stanza| stanza.parse::<ForwardedStanza>())
      .collect::<Result<Vec<_>, _>>()
      .and_then(|v| {
        (!v.is_empty())
          .then_some(v)
          .ok_or(ForwardedHeaderValueParseError::HeaderIsEmpty)
      })
      .map(|v| ForwardedHeaderValue { values: v })
  }
}

impl IntoIterator for ForwardedHeaderValue {
  type Item = ForwardedStanza;
  type IntoIter = std::vec::IntoIter<Self::Item>;

  fn into_iter(self) -> Self::IntoIter {
    self.values.into_iter()
  }
}

#[derive(Debug, Error)]
pub enum ForwardedHeaderValueParseError {
  #[error("Header is empty")]
  HeaderIsEmpty,
  #[error("Stanza contained illegal part {0}")]
  InvalidPart(String),
  #[error("Stanza specified an invalid protocol")]
  InvalidProtocol,
  #[error("Identifier specified an invalid or malformed IP address")]
  InvalidAddress,
  #[error("Identifier specified uses an obfuscated node ({0:?}) that is invalid")]
  InvalidObfuscatedNode(String),
  #[error("Identifier specified an invalid or malformed IP address")]
  IpParseErr(#[from] std::net::AddrParseError),
}

impl FromStr for ForwardedHeaderValue {
  type Err = ForwardedHeaderValueParseError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    Self::from_forwarded(s)
  }
}

/// Get the client IP address from the request.
///
/// This function will try to get the client IP address from the following
/// sources:
///
/// - `x-forwarded-for` header
/// - `x-real-ip` header
/// - `forwarded` header
/// - `ConnectInfo` extension
///
/// The order of precedence is as listed above. We put headers first because the
/// physical IP address from `ConnectInfo` extension is not always correct.
/// Nginx and other reverse proxies will shadow the real IP with `127.0.0.1`, to
/// solve this problem, then will set the `x-forwarded-for` header to the client
/// IP address, so we just use it.
///
/// In some cases, the `x-forwarded-for` header may not set, the IP record will
/// be localhost, so please make sure the reverse proxy is configured correctly.
pub fn get_client_ip<B>(request: &Request<B>) -> Option<IpAddr> {
  let headers = request.headers();
  maybe_x_forwarded_for(headers)
    .or_else(|| maybe_x_real_ip(headers))
    .or_else(|| maybe_forwarded(headers))
    .or_else(|| maybe_connect_info(request))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct IpRecord {
  pub ip: String,
  pub user_id: i64,
}

pub async fn ip_record(
  State(queue): State<Queue>, Extension(token): Extension<Token>, mut req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
  let ip = match get_client_ip(&req) {
    Some(ip) => {
      req.extensions_mut().insert::<IpAddr>(ip);
      ip.to_string()
    }
    None => {
      warn!("Unable to get client IP address from request");
      return Ok(next.run(req).await);
    }
  };
  debug!("Client IP address: {}", ip);
  queue
    .publish(
      "ip-record",
      IpRecord {
        ip,
        user_id: token.id,
      },
    )
    .await?;
  debug!("IP record message published");
  Ok(next.run(req).await)
}

async fn ip_record_worker_exec(message: jetstream::Message, db: &Database) -> anyhow::Result<()> {
  let req = String::from_utf8(message.message.payload.to_vec())?;
  let req = serde_json::from_str::<IpRecord>(&req)?;
  let model = ip::get_or_create(&db.conn, &req.ip).await?;
  ip::link_user(&db.conn, req.user_id, model.id).await.ok();
  Ok(())
}

pub async fn ip_record_worker(mut messages: Stream, db: Database) {
  while let Some(message) = messages.next().await {
    if let Ok(message) = message {
      message.ack().await.ok();
      ip_record_worker_exec(message.clone(), &db)
        .await
        .map_err(|e| error!("Failed to process message: {:?}", e))
        .ok();
    } else {
      error!("Failed to receive message from nats: {:?}", message);
    }
  }
}

#[derive(Debug, Serialize, Deserialize, Clone, Eq, PartialEq)]
pub struct ProxiedIpExtractor;

impl KeyExtractor for ProxiedIpExtractor {
  type Key = String;

  fn extract<B>(&self, req: &Request<B>) -> Result<Self::Key, GovernorError> {
    let ip = get_client_ip(req).ok_or(GovernorError::UnableToExtractKey)?;
    Ok(ip.to_string())
  }
}

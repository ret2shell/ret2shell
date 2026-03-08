use std::{
  net::{IpAddr, SocketAddr},
  str::FromStr,
};

use axum::{
  Extension,
  extract::{ConnectInfo, Request, State},
  http::{HeaderMap, header::FORWARDED},
  middleware::Next,
  response::IntoResponse,
};
use r2s_queue::Queue;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tower_governor::{GovernorError, key_extractor::KeyExtractor};
use tower_http::request_id::{MakeRequestId, RequestId};
use tracing::{Span, debug, warn};

use super::auth::Token;
use crate::{traits::ResponseError, worker::ip_record::IpRecord};

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

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
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

#[derive(Debug, PartialEq, Eq, Clone)]
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
  #[error("header is empty")]
  HeaderIsEmpty,
  #[error("stanza contained illegal part {0}")]
  InvalidPart(String),
  #[error("stanza specified an invalid protocol")]
  InvalidProtocol,
  #[error("identifier specified an invalid or malformed IP address")]
  InvalidAddress,
  #[error("Identifier specified uses an obfuscated node ({0:?}) that is invalid")]
  InvalidObfuscatedNode(String),
  #[error("identifier specified an invalid or malformed IP address")]
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

pub async fn ip_record(
  State(queue): State<Queue>, Extension(token): Extension<Token>, mut req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
  let ip = match get_client_ip(&req) {
    Some(ip) => {
      req.extensions_mut().insert::<IpAddr>(ip);
      ip.to_string()
    }
    None => {
      warn!(request=?req, "unable to get client IP address from request");
      return Ok(next.run(req).await);
    }
  };
  debug!(?ip, "got client IP address");
  let trace = req
    .headers()
    .get("x-request-id")
    .and_then(|hv| hv.to_str().ok().map(|s| s.to_string()))
    .unwrap_or_else(|| nanoid::nanoid!());
  if token.id != 0 {
    queue
      .publish(
        "ip-record",
        IpRecord {
          ip: ip.clone(),
          user_id: token.id,
        },
        &trace,
      )
      .await?;
    debug!("IP record message published");
  } else {
    debug!("token ID is 0, skipping IP record");
  }

  Span::current().record("from", ip.as_str());

  Ok(next.run(req).await)
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

/// A [`MakeRequestId`] that generates `NanoID`s.
#[derive(Clone, Copy, Default)]
pub struct MakeRequestNanoId;

impl MakeRequestId for MakeRequestNanoId {
  fn make_request_id<B>(&mut self, _request: &Request<B>) -> Option<RequestId> {
    let request_id = nanoid::nanoid!();
    Some(RequestId::new(request_id.parse().unwrap()))
  }
}

#[cfg(test)]
mod tests {
  use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    str::FromStr,
  };

  use axum::{
    extract::ConnectInfo,
    http::{HeaderMap, Request, header::FORWARDED},
  };

  use super::{
    ForwardedHeaderValue, ForwardedHeaderValueParseError, ForwardedStanza, Identifier, Protocol,
    X_FORWARDED_FOR, X_REAL_IP, get_client_ip,
  };

  fn request_with_headers(headers: HeaderMap) -> Request<()> {
    let mut request = Request::builder().uri("/").body(()).unwrap();
    *request.headers_mut() = headers;
    request
      .extensions_mut()
      .insert(ConnectInfo(SocketAddr::from((Ipv4Addr::LOCALHOST, 8080))));
    request
  }

  #[test]
  fn identifier_parses_standard_forwarded_variants() {
    assert_eq!(
      Identifier::from_str("192.0.2.10:443").unwrap(),
      Identifier::SocketAddr(SocketAddr::from((Ipv4Addr::new(192, 0, 2, 10), 443)))
    );
    assert_eq!(
      Identifier::from_str("198.51.100.2").unwrap(),
      Identifier::IpAddr(IpAddr::V4(Ipv4Addr::new(198, 51, 100, 2)))
    );
    assert_eq!(
      Identifier::from_str("[2001:db8::1]").unwrap(),
      Identifier::IpAddr(IpAddr::V6(Ipv6Addr::from_str("2001:db8::1").unwrap()))
    );
    assert_eq!(
      Identifier::from_str("_gateway").unwrap(),
      Identifier::String("_gateway".to_owned())
    );
    assert_eq!(
      Identifier::from_str("unknown").unwrap(),
      Identifier::Unknown
    );
  }

  #[test]
  fn forwarded_stanza_parses_host_protocol_and_ipv6_addresses() {
    let stanza = ForwardedStanza::from_str(
      "for=\"[2001:db8::9]\";by=192.0.2.1;host=\"git.example.com:443\";proto=https",
    )
    .unwrap();

    assert_eq!(
      stanza.forwarded_for,
      Some(Identifier::IpAddr(IpAddr::V6(
        Ipv6Addr::from_str("2001:db8::9").unwrap()
      )))
    );
    assert_eq!(
      stanza.forwarded_by,
      Some(Identifier::IpAddr(IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1))))
    );
    assert_eq!(
      stanza.forwarded_host.as_deref(),
      Some("git.example.com:443")
    );
    assert_eq!(stanza.forwarded_proto, Some(Protocol::Https));
  }

  #[test]
  fn forwarded_parser_rejects_empty_headers_and_invalid_nodes() {
    assert!(matches!(
      ForwardedHeaderValue::from_str(" , "),
      Err(ForwardedHeaderValueParseError::HeaderIsEmpty)
    ));
    assert!(matches!(
      Identifier::from_str("proxy-a"),
      Err(ForwardedHeaderValueParseError::InvalidObfuscatedNode(node)) if node == "proxy-a"
    ));
  }

  #[test]
  fn get_client_ip_prefers_x_forwarded_for_over_other_sources() {
    let mut headers = HeaderMap::new();
    headers.insert(X_FORWARDED_FOR, "203.0.113.10, 10.0.0.1".parse().unwrap());
    headers.insert(X_REAL_IP, "198.51.100.1".parse().unwrap());
    headers.insert(FORWARDED, "for=192.0.2.99".parse().unwrap());

    let request = request_with_headers(headers);

    assert_eq!(
      get_client_ip(&request),
      Some(IpAddr::V4(Ipv4Addr::new(203, 0, 113, 10)))
    );
  }

  #[test]
  fn get_client_ip_uses_forwarded_and_connect_info_as_fallbacks() {
    let mut headers = HeaderMap::new();
    headers.insert(
      FORWARDED,
      "for=unknown;by=192.0.2.1, for=\"[2001:db8::8]\""
        .parse()
        .unwrap(),
    );

    let request = request_with_headers(headers);
    assert_eq!(
      get_client_ip(&request),
      Some(IpAddr::V6(Ipv6Addr::from_str("2001:db8::8").unwrap()))
    );

    let request = request_with_headers(HeaderMap::new());
    assert_eq!(
      get_client_ip(&request),
      Some(IpAddr::V4(Ipv4Addr::LOCALHOST))
    );
  }
}

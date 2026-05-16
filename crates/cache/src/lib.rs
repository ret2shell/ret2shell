use std::fmt::Display;

use r2s_config::cache;
use redis::{AsyncCommands, SetExpiry, SetOptions, aio::MultiplexedConnection};
use serde::{Deserialize, Serialize};
use tracing::debug;
pub use traits::CacheError;

mod traits;

macro_rules! with_domain {
  ($domain:expr, $key:expr) => {
    format!(
      "{}:{}",
      $domain
        .clone()
        .ok_or(CacheError::DomainNeeded($key.to_string()))?,
      $key
    )
  };
}

#[derive(Debug, Clone)]
pub struct Cache {
  conn: MultiplexedConnection,
  domain: Option<String>,
}

impl Cache {
  pub fn new(conn: MultiplexedConnection) -> Self {
    Cache { conn, domain: None }
  }

  /// Set the domain for the cache.
  ///
  /// * `domain` - The domain for the cache.
  ///
  /// You should call this function at each time you want to get some data
  /// from the cache.
  ///
  /// ```ignore
  /// cache.at("email").set("example@private.ret.sh.cn", "114514").await?;
  /// ```
  ///
  /// or scope it in a function:
  ///
  /// ```ignore
  /// async fn some_user_endpoint(State(cache): State<Cache>, ...) -> impl IntoResponse {
  ///     let cache = cache.at("user");
  ///     ...
  /// }
  /// ```
  ///
  /// use cache directly without `domain` set will cause a `DomainNeeded`
  /// error.
  pub fn at(&self, domain: &str) -> Self {
    Cache {
      domain: Some(domain.to_string()),
      ..self.clone()
    }
  }

  pub async fn ping(&self) -> Result<(), CacheError> {
    let mut conn = self.conn.clone();
    redis::cmd("PING").query_async::<String>(&mut conn).await?;
    Ok(())
  }

  pub async fn get<T>(&self, key: impl Display) -> Result<Option<T>, CacheError>
  where
    T: for<'de> Deserialize<'de>, {
    let domain_key = with_domain!(self.domain, key);
    let mut conn = self.conn.clone();
    let result: Option<String> = conn.get(&domain_key).await?;
    match result {
      Some(s) => Ok(Some(serde_json::from_str(&s)?)),
      None => Ok(None),
    }
  }

  pub async fn getdel<T>(&self, key: impl Display) -> Result<Option<T>, CacheError>
  where
    T: for<'de> Deserialize<'de>, {
    let domain_key = with_domain!(self.domain, key);
    let mut conn = self.conn.clone();
    let result: Option<String> = redis::cmd("GETDEL")
      .arg(&domain_key)
      .query_async(&mut conn)
      .await?;
    match result {
      Some(s) => Ok(Some(serde_json::from_str(&s)?)),
      None => Ok(None),
    }
  }

  pub async fn set(
    &self, key: impl Display, value: impl Serialize + Send,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    let mut conn = self.conn.clone();
    let _: () = conn.set(&domain_key, value).await?;
    Ok(())
  }

  /// Set the key with a ttl.
  ///
  /// * `key` - The key to set.
  /// * `value` - The value to set.
  /// * `ttl` - The time to live for the key in seconds.
  pub async fn set_ex(
    &self, key: impl Display, value: impl Serialize + Send, ttl: i64,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    let mut conn = self.conn.clone();
    let _: Option<String> = conn
      .set_options(
        &domain_key,
        value,
        SetOptions::default().with_expiration(SetExpiry::EX(ttl as u64)),
      )
      .await?;
    Ok(())
  }

  pub async fn incr(&self, key: impl Display) -> Result<i64, CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let mut conn = self.conn.clone();
    let result: i64 = conn.incr(&domain_key, 1).await?;
    Ok(result)
  }

  pub async fn expire(&self, key: impl Display, ttl: i64) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let mut conn = self.conn.clone();
    let _: bool = conn.expire(&domain_key, ttl).await?;
    Ok(())
  }

  pub async fn del(&self, key: impl Display) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let mut conn = self.conn.clone();
    let _: () = conn.del(&domain_key).await?;
    Ok(())
  }

  pub async fn exists(&self, key: impl Display) -> Result<bool, CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let mut conn = self.conn.clone();
    let result: bool = conn.exists(&domain_key).await?;
    Ok(result)
  }

  pub async fn push(
    &self, key: impl Display, value: impl Serialize + Send,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    let mut conn = self.conn.clone();
    let _: () = conn.lpush(&domain_key, value).await?;
    Ok(())
  }

  pub async fn pop<T>(&self, key: impl Display) -> Result<Option<T>, CacheError>
  where
    T: for<'de> Deserialize<'de>, {
    let domain_key = with_domain!(self.domain, key);
    let mut conn = self.conn.clone();
    let result: Option<String> = conn.lpop(&domain_key, None).await?;
    match result {
      Some(s) => Ok(Some(serde_json::from_str(&s)?)),
      None => Ok(None),
    }
  }

  pub async fn rem(
    &self, key: impl Display, value: impl Serialize + Send,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    let mut conn = self.conn.clone();
    let _: () = conn.lrem(&domain_key, 0, value).await?;
    Ok(())
  }

  pub async fn flush(&self) -> Result<(), CacheError> {
    let mut conn = self.conn.clone();
    redis::cmd("FLUSHALL").query_async::<()>(&mut conn).await?;
    Ok(())
  }
}

/// Init the cache manager.
///
/// * `url` - The redis url, supports centralized / clustered and
///   sentinel-layered node.
/// * `max_connections` - The max connections for each node.
pub async fn initialize(
  config: &Option<cache::Config>, flush: Option<bool>,
) -> Result<Cache, CacheError> {
  let config = config.clone().ok_or(CacheError::ConfigNeeded)?;
  debug!(url = ?config.url, "initialize cache manager");
  let client = redis::Client::open(config.url.as_str())?;
  let conn = client.get_multiplexed_async_connection().await?;
  if flush.unwrap_or(false) {
    let mut conn = conn.clone();
    redis::cmd("FLUSHALL").query_async::<()>(&mut conn).await?;
  }
  Ok(Cache::new(conn))
}

pub async fn down(config: &Option<cache::Config>) -> Result<(), CacheError> {
  let config = config.clone().ok_or(CacheError::ConfigNeeded)?;
  debug!(url = ?config.url, "down cache manager");
  let client = redis::Client::open(config.url.as_str())?;
  let mut conn = client.get_multiplexed_async_connection().await?;
  redis::cmd("FLUSHALL").query_async::<()>(&mut conn).await?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_cache_error_domain_needed_display() {
    let err = CacheError::DomainNeeded("test_key".to_string());
    let msg = err.to_string();
    assert!(msg.contains("domain needed for key"));
    assert!(msg.contains("test_key"));
  }

  #[test]
  fn test_cache_error_serde_from_json_error() {
    let json_err = serde_json::from_str::<serde_json::Value>("invalid").unwrap_err();
    let err: CacheError = json_err.into();
    assert!(matches!(err, CacheError::Serde(_)));
    assert!(err.to_string().contains("serde error"));
  }

  #[test]
  fn test_cache_error_other_display() {
    let err = CacheError::Other("custom message".to_string());
    assert_eq!(err.to_string(), "other error: custom message");
  }

  #[test]
  fn test_cache_error_config_needed_display() {
    let err = CacheError::ConfigNeeded;
    assert_eq!(err.to_string(), "cache config is needed");
  }

  #[test]
  fn test_cache_error_redis_debug() {
    let err = CacheError::Other("test".to_string());
    assert!(format!("{:?}", err).contains("Other"));
  }
}

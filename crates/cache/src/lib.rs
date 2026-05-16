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

#[cfg(test)]
mod integration {
  use super::*;

  fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string())
  }

  async fn setup() -> Cache {
    let client = redis::Client::open(redis_url()).expect("failed to open redis client");
    let conn = client
      .get_multiplexed_async_connection()
      .await
      .expect("failed to connect to redis");
    Cache::new(conn)
  }

  #[tokio::test]
  async fn test_ping() {
    let cache = setup().await;
    cache.ping().await.expect("ping should succeed");
  }

  #[tokio::test]
  async fn test_set_and_get() {
    let cache = setup().await.at("test_set_and_get");
    cache
      .set("key1", "value1")
      .await
      .expect("set should succeed");
    let result: Option<String> = cache.get("key1").await.expect("get should succeed");
    assert_eq!(result, Some("value1".to_string()));
    cache.del("key1").await.ok();
  }

  #[tokio::test]
  async fn test_get_nonexistent() {
    let cache = setup().await.at("test_get_nonexistent");
    let result: Option<String> = cache
      .get("nonexistent_key")
      .await
      .expect("get should succeed");
    assert_eq!(result, None);
  }

  #[tokio::test]
  async fn test_set_ex() {
    let cache = setup().await.at("test_set_ex");
    cache
      .set_ex("key_ttl", "expires_soon", 3600)
      .await
      .expect("set_ex should succeed");
    let result: Option<String> = cache.get("key_ttl").await.expect("get should succeed");
    assert_eq!(result, Some("expires_soon".to_string()));
    cache.del("key_ttl").await.ok();
  }

  #[tokio::test]
  async fn test_incr() {
    let cache = setup().await.at("test_incr");
    let val = cache.incr("counter").await.expect("incr should succeed");
    assert_eq!(val, 1);
    let val = cache.incr("counter").await.expect("incr should succeed");
    assert_eq!(val, 2);
    cache.del("counter").await.ok();
  }

  #[tokio::test]
  async fn test_exists_and_del() {
    let cache = setup().await.at("test_exists_and_del");
    let exists = cache
      .exists("temp_key")
      .await
      .expect("exists should succeed");
    assert!(!exists);
    cache
      .set("temp_key", "temp_value")
      .await
      .expect("set should succeed");
    let exists = cache
      .exists("temp_key")
      .await
      .expect("exists should succeed");
    assert!(exists);
    cache.del("temp_key").await.expect("del should succeed");
    let exists = cache
      .exists("temp_key")
      .await
      .expect("exists should succeed");
    assert!(!exists);
  }

  #[tokio::test]
  async fn test_getdel() {
    let cache = setup().await.at("test_getdel");
    cache
      .set("key_gd", "value_gd")
      .await
      .expect("set should succeed");
    let result: Option<String> = cache.getdel("key_gd").await.expect("getdel should succeed");
    assert_eq!(result, Some("value_gd".to_string()));
    let exists = cache.exists("key_gd").await.expect("exists should succeed");
    assert!(!exists);
  }

  #[tokio::test]
  async fn test_expire() {
    let cache = setup().await.at("test_expire");
    cache
      .set("key_exp", "value_exp")
      .await
      .expect("set should succeed");
    cache
      .expire("key_exp", 1)
      .await
      .expect("expire should succeed");
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    let result: Option<String> = cache.get("key_exp").await.expect("get should succeed");
    assert_eq!(result, None);
  }

  #[tokio::test]
  async fn test_push_and_pop() {
    let cache = setup().await.at("test_push_and_pop");
    cache
      .push("list_key", "item1")
      .await
      .expect("push should succeed");
    cache
      .push("list_key", "item2")
      .await
      .expect("push should succeed");
    let result: Option<String> = cache.pop("list_key").await.expect("pop should succeed");
    assert_eq!(result, Some("item2".to_string()));
    let result: Option<String> = cache.pop("list_key").await.expect("pop should succeed");
    assert_eq!(result, Some("item1".to_string()));
    let result: Option<String> = cache.pop("list_key").await.expect("pop should succeed");
    assert_eq!(result, None);
  }

  #[tokio::test]
  async fn test_rem() {
    let cache = setup().await.at("test_rem");
    cache
      .push("list_rem", "keep")
      .await
      .expect("push should succeed");
    cache
      .push("list_rem", "remove_me")
      .await
      .expect("push should succeed");
    cache
      .push("list_rem", "keep")
      .await
      .expect("push should succeed");
    cache
      .rem("list_rem", "remove_me")
      .await
      .expect("rem should succeed");
    let mut remaining: Vec<String> = Vec::new();
    while let Some(item) = cache.pop::<String>("list_rem").await.ok().flatten() {
      remaining.push(item);
    }
    assert!(!remaining.contains(&"remove_me".to_string()));
    assert!(remaining.contains(&"keep".to_string()));
  }

  #[tokio::test]
  async fn test_complex_types() {
    let cache = setup().await.at("test_complex_types");
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct TestPayload {
      id: i32,
      name: String,
      tags: Vec<String>,
    }
    let payload = TestPayload {
      id: 42,
      name: "test".to_string(),
      tags: vec!["rust".to_string(), "redis".to_string()],
    };
    cache
      .set("complex", &payload)
      .await
      .expect("set should succeed");
    let result: Option<TestPayload> = cache.get("complex").await.expect("get should succeed");
    assert_eq!(result, Some(payload));
    cache.del("complex").await.ok();
  }

  #[tokio::test]
  async fn test_cache_at_scoping() {
    let cache = setup().await;
    let user_cache = cache.at("user");
    let email_cache = cache.at("email");

    user_cache
      .set("key1", "user_val")
      .await
      .expect("set should succeed");
    email_cache
      .set("key1", "email_val")
      .await
      .expect("set should succeed");

    let user_val: Option<String> = user_cache.get("key1").await.expect("get should succeed");
    let email_val: Option<String> = email_cache.get("key1").await.expect("get should succeed");

    assert_eq!(user_val, Some("user_val".to_string()));
    assert_eq!(email_val, Some("email_val".to_string()));

    user_cache.del("key1").await.ok();
    email_cache.del("key1").await.ok();
  }

  #[tokio::test]
  async fn test_missing_domain_error() {
    let cache = setup().await;
    let result: Result<Option<String>, CacheError> = cache.get("no_domain_key").await;
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(matches!(err, CacheError::DomainNeeded(_)));
    assert!(err.to_string().contains("no_domain_key"));
  }
}

use std::fmt::Display;

pub use fred::error::{Error as RedisError, ErrorKind as RedisErrorKind};
use fred::prelude::*;
use r2s_config::cache;
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
  client: Client,
  domain: Option<String>,
}

impl Cache {
  pub fn new(client: Client) -> Self {
    Cache {
      client,
      domain: None,
    }
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
    self.client.ping::<Option<String>>(None).await?;
    Ok(())
  }

  pub async fn get<T>(
    &self, key: impl Into<Key> + Send + Display,
  ) -> Result<Option<T>, CacheError>
  where
    T: for<'de> Deserialize<'de>, {
    let domain_key = with_domain!(self.domain, key);
    let result = self.client.get::<Option<Value>, _>(domain_key).await?;
    match result {
      Some(result) => Ok(Some(serde_json::from_value(result)?)),
      None => Ok(None),
    }
  }

  pub async fn getdel<T>(
    &self, key: impl Into<Key> + Send + Display,
  ) -> Result<Option<T>, CacheError>
  where
    T: for<'de> Deserialize<'de>, {
    let domain_key = with_domain!(self.domain, key);
    let result = self.client.getdel::<Option<Value>, _>(domain_key).await?;
    match result {
      Some(result) => Ok(Some(serde_json::from_value(result)?)),
      None => Ok(None),
    }
  }

  pub async fn set(
    &self, key: impl Into<Key> + Send + Display, value: impl Serialize + Send,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    self
      .client
      .set::<(), _, _>(domain_key, value, None, None, false)
      .await?;
    Ok(())
  }

  /// Set the key with a ttl.
  ///
  /// * `key` - The key to set.
  /// * `value` - The value to set.
  /// * `ttl` - The time to live for the key in seconds.
  pub async fn set_ex(
    &self, key: impl Into<Key> + Send + Display, value: impl Serialize + Send, ttl: i64,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    self
      .client
      .set::<(), _, _>(domain_key, value, Some(Expiration::EX(ttl)), None, false)
      .await?;
    Ok(())
  }

  pub async fn incr(&self, key: impl Into<Key> + Send + Display) -> Result<i64, CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let result = self.client.incr(domain_key).await?;
    Ok(result)
  }

  pub async fn expire(
    &self, key: impl Into<Key> + Send + Display, ttl: i64,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    self.client.expire::<(), _>(domain_key, ttl, None).await?;
    Ok(())
  }

  pub async fn del(&self, key: impl Into<Key> + Send + Display) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    self.client.del::<(), _>(domain_key).await?;
    Ok(())
  }

  pub async fn exists(&self, key: impl Into<Key> + Send + Display) -> Result<bool, CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let result = self.client.exists(domain_key).await?;
    Ok(result)
  }

  pub async fn push(
    &self, key: impl Into<Key> + Send + Display, value: impl Serialize + Send,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    self.client.lpush::<(), _, _>(domain_key, value).await?;
    Ok(())
  }

  pub async fn pop<T>(
    &self, key: impl Into<Key> + Send + Display,
  ) -> Result<Option<T>, CacheError>
  where
    T: for<'de> Deserialize<'de>, {
    let domain_key = with_domain!(self.domain, key);
    let result = self
      .client
      .lpop::<Option<Value>, _>(domain_key, None)
      .await?;
    match result {
      Some(result) => Ok(Some(serde_json::from_value(result)?)),
      None => Ok(None),
    }
  }

  pub async fn rem(
    &self, key: impl Into<Key> + Send + Display, value: impl Serialize + Send,
  ) -> Result<(), CacheError> {
    let domain_key = with_domain!(self.domain, key);
    let value = serde_json::to_string(&value)?;
    self.client.lrem::<(), _, _>(domain_key, 0, value).await?;
    Ok(())
  }

  pub async fn flush(&self) -> Result<(), CacheError> {
    self.client.flushall::<()>(false).await?;
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
  debug!(url=?config.url, "initialize cache manager");
  let config = Config::from_url(&config.url)?;
  let client = Client::new(config, None, None, None);
  client.init().await?;
  if flush.unwrap_or(false) {
    client.flushall::<()>(false).await?;
  }
  Ok(Cache::new(client))
}

pub async fn down(config: &Option<cache::Config>) -> Result<(), CacheError> {
  let config = config.clone().ok_or(CacheError::ConfigNeeded)?;
  debug!(url=?config.url, "down cache manager");
  let config = Config::from_url(&config.url)?;
  let client = Client::new(config, None, None, None);
  client.init().await?;
  client.flushall::<()>(false).await?;
  Ok(())
}

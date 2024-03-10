use std::fmt::Display;

use fred::prelude::*;
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
    client: RedisClient,
    domain: Option<String>,
}

impl Cache {
    pub fn new(client: RedisClient) -> Self {
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
    /// ```rust
    /// cache.at("email").set("example@woooo.tech", "114514").await?;
    /// ```
    ///
    /// or scope it in a function:
    ///
    /// ```rust
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

    pub async fn get(
        &self, key: impl Into<RedisKey> + Send + Display,
    ) -> Result<impl Deserialize, CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let result = self.client.get::<Value, _>(domain_key).await?;
        Ok(result)
    }

    pub async fn getdel(
        &self, key: impl Into<RedisKey> + Send + Display,
    ) -> Result<impl Deserialize, CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let result = self.client.getdel::<Value, _>(domain_key).await?;
        Ok(result)
    }

    pub async fn set(
        &self, key: impl Into<RedisKey> + Send + Display, value: impl Serialize + Send,
    ) -> Result<(), CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        self.client
            .set(domain_key, value, None, None, false)
            .await?;
        Ok(())
    }

    pub async fn set_ex(
        &self, key: impl Into<RedisKey> + Send + Display, value: impl Serialize + Send, ttl: i64,
    ) -> Result<(), CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        self.client
            .set(domain_key, value, Some(Expiration::EX(ttl)), None, false)
            .await?;
        Ok(())
    }

    pub async fn incr(&self, key: impl Into<RedisKey> + Send + Display) -> Result<i64, CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let result = self.client.incr(domain_key).await?;
        Ok(result)
    }

    pub async fn expire(
        &self, key: impl Into<RedisKey> + Send + Display, ttl: i64,
    ) -> Result<(), CacheError> {
        let domain_key = with_domain!(self.domain, key);
        self.client.expire(domain_key, ttl).await?;
        Ok(())
    }

    pub async fn del(&self, key: impl Into<RedisKey> + Send + Display) -> Result<(), CacheError> {
        let domain_key = with_domain!(self.domain, key);
        self.client.del(domain_key).await?;
        Ok(())
    }

    pub async fn exists(
        &self, key: impl Into<RedisKey> + Send + Display,
    ) -> Result<bool, CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let result = self.client.exists(domain_key).await?;
        Ok(result)
    }

    pub async fn push(
        &self, key: impl Into<RedisKey> + Send + Display, value: impl Serialize + Send,
    ) -> Result<(), CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        self.client.lpush(domain_key, value).await?;
        Ok(())
    }

    pub async fn pop(
        &self, key: impl Into<RedisKey> + Send + Display,
    ) -> Result<Value, CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let result = self.client.lpop::<Value, _>(domain_key, None).await?;
        Ok(result)
    }

    pub async fn rem(
        &self, key: impl Into<RedisKey> + Send + Display, value: impl Serialize + Send,
    ) -> Result<(), CacheError> {
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        self.client.lrem(domain_key, 0, value).await?;
        Ok(())
    }
}

/// Init the cache manager.
///
/// * `url` - The redis url, supports centralized / clustered and
///   sentinel-layered node.
/// * `max_connections` - The max connections for each node.
pub async fn initialize(url: &str) -> Result<Cache, CacheError> {
    debug!("initialize cache manager with url: {url:?}");
    let config = RedisConfig::from_url(url)?;
    let client = RedisClient::new(config, None, None, None);
    Ok(Cache::new(client))
}

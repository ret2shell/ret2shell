//! The in-memory cache provider, which is used to store the temporary data like
//! user's token.
//!
//! The cache provider is implemented by using the `fred` crate and `redis`.

pub mod cluster;
pub mod manager;

pub use manager::{CacheError, RedisPool};
use manager::{PoolLike, PooledConnectionLike};
pub use redis::RedisError;
use serde::Deserialize;
use tracing::debug;

#[derive(Clone, Debug)]
pub struct Cache {
    pool: RedisPool,
    domain: Option<String>,
}

macro_rules! with_domain {
    ($domain:expr, $key:expr) => {
        format!(
            "{}:{}",
            $domain
                .clone()
                .ok_or(CacheError::DomainNeeded($key.to_owned()))?,
            $key
        )
    };
}

impl Cache {
    pub fn from(pool: RedisPool) -> Self {
        Self { pool, domain: None }
    }

    /// Set the domain for the cache for the following operations.
    ///
    /// * `domain` - The domain to set.
    ///
    /// ```rust
    /// cache.at("user").set("name", "John").await?;
    /// cache.at("user").get("name").await?;
    /// ```
    pub fn at(&self, domain: &str) -> Self {
        Self {
            domain: Some(domain.to_owned()),
            ..self.to_owned()
        }
    }

    // get a value
    pub async fn get(
        &mut self, key: &str,
    ) -> Result<Option<impl Deserialize>, CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let value: Option<String> = conn.get(&domain_key).await?;
        if let Some(value) = value {
            debug!("get from key {domain_key}, value: {value}");
            Ok(Some(serde_json::from_str(&value)?))
        } else {
            Ok(None)
        }
    }

    // get a value and then delete it
    pub async fn get_del(
        &mut self, key: &str,
    ) -> Result<Option<impl Deserialize>, CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let value: Option<String> = conn.get_del(&domain_key).await?;
        if let Some(value) = value {
            debug!("get from key {domain_key}, value: {value}, deleted.");
            Ok(Some(serde_json::from_str(&value)?))
        } else {
            Ok(None)
        }
    }

    // set value
    pub async fn set(
        &mut self, key: &str, value: impl serde::Serialize,
    ) -> Result<(), CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        conn.set(&domain_key, &value).await?;
        debug!("set key {domain_key}, value: {value}");
        Ok(())
    }

    // set value with expire time
    pub async fn set_ex(
        &mut self, key: &str, value: impl serde::Serialize, seconds: u64,
    ) -> Result<(), CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        conn.pset_ex(&domain_key, &value, seconds.saturating_mul(1000))
            .await?;
        debug!("set key {domain_key}, value: {value} with expiry: {seconds}");
        Ok(())
    }

    // increase a number value with delta, will create the key with value `0` if not exists and then increase it & return
    pub async fn incr(&mut self, key: &str, delta: i64) -> Result<i64, CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let r = conn.incr(&domain_key, &delta).await?;
        debug!("incr key {domain_key}, delta: {delta}, result in: {r}");
        Ok(r)
    }

    // set the expire time of the key
    pub async fn expire(&mut self, key: &str, seconds: i64) -> Result<(), CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        conn.expire(&domain_key, seconds).await?;
        debug!("expire key {domain_key}, seconds: {seconds}");
        Ok(())
    }

    // delete a key
    pub async fn del(&mut self, key: &str) -> Result<(), CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        conn.del(&domain_key).await?;
        debug!("del key {domain_key}");
        Ok(())
    }

    // push value into list
    pub async fn push(
        &mut self, key: &str, value: impl serde::Serialize,
    ) -> Result<(), CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        conn.rpush(&domain_key, &value).await?;
        debug!("push key {domain_key}, value: {value}");
        Ok(())
    }

    // pop value from list
    pub async fn pop(
        &mut self, key: &str, count: Option<core::num::NonZeroUsize>,
    ) -> Result<Option<impl Deserialize>, CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let value: Option<String> = conn.lpop(&domain_key, count).await?;
        if let Some(value) = value {
            debug!("pop from key {domain_key}, value: {value}");
            Ok(Some(serde_json::from_str(&value)?))
        } else {
            Ok(None)
        }
    }

    // remove value from list
    pub async fn rem(
        &mut self, key: &str, count: isize, value: impl serde::Serialize,
    ) -> Result<(), CacheError<RedisError>> {
        let mut conn = self.pool.get().await?;
        let domain_key = with_domain!(self.domain, key);
        let value = serde_json::to_string(&value)?;
        conn.lrem(&domain_key, count, &value).await?;
        debug!("rem key {domain_key}, count: {count}, value: {value}");
        Ok(())
    }
}

/// Init the cache manager.
///
/// * `nodes` - The redis nodes.
/// * `max_connections` - The max connections for each node.
pub async fn initialize(nodes: &[String], max_connections: u16) -> Result<Cache, RedisError> {
    debug!("initialize cache manager with nodes: {nodes:?}, max_connections: {max_connections}");
    Ok(Cache::from(
        manager::new_redis_pool(nodes, max_connections).await?,
    ))
}

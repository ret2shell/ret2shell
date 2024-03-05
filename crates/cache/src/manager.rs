use bb8::{Pool, RunError};
use bb8_redis::RedisMultiplexedConnectionManager;
use redis::{FromRedisValue, RedisError, RedisResult, ToRedisArgs};
use thiserror::Error;

pub use super::cluster::RedisClusterConnectionManager;

/// Unified redis pool for both clustered and non-clustered redis.
#[derive(Clone, Debug)]
pub enum RedisPool {
    Clustered(ClusteredRedisPool),
    NonClustered(NonClusteredRedisPool),
}

/// The redis pool for clustered redis.
#[derive(Clone, Debug)]
pub struct ClusteredRedisPool {
    pool: Pool<RedisClusterConnectionManager>,
}

/// The redis pool for non-clustered redis.
#[derive(Clone, Debug)]
pub struct NonClusteredRedisPool {
    pool: Pool<RedisMultiplexedConnectionManager>,
}

/// Unified pooled connection for both clustered and non-clustered redis.
pub enum PooledConnection<'a> {
    Clustered(ClusteredPooledConnection<'a>),
    NonClustered(NonClusteredPooledConnection<'a>),
}

#[async_trait::async_trait]
pub trait PooledConnectionLike {
    /// Send a redis command to the server and return the result.
    async fn query_async<T: FromRedisValue>(&mut self, cmd: redis::Cmd) -> RedisResult<T>;
    /// Send a redis pipeline to the server and return the result.
    async fn query_async_pipeline<T: FromRedisValue>(
        &mut self, pipe: redis::Pipeline,
    ) -> RedisResult<T>;

    /// Delete a key.
    async fn del<K: ToRedisArgs + Send, T: FromRedisValue>(&mut self, key: K) -> RedisResult<T> {
        self.query_async(redis::Cmd::del(key)).await
    }

    /// Get the value of a key.
    ///
    /// If the key does not exist, you can retrieve it with `Option<T>` or
    /// simply `T`. A conversion error will be raised if the value is not
    /// the same type as `T`.
    async fn get<K: ToRedisArgs + Send, T: FromRedisValue>(&mut self, key: K) -> RedisResult<T> {
        let mut cmd = redis::cmd(if key.is_single_arg() { "GET" } else { "MGET" });
        cmd.arg(key);
        self.query_async(cmd).await
    }

    async fn get_del<K: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::get_del(key)).await
    }

    /// Pop `count` values from left of the `key` list.
    async fn lpop<K: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, count: Option<core::num::NonZeroUsize>,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::lpop(key, count)).await
    }

    /// Get objects in range from `start` to `stop` from the `key` list.
    ///
    /// The negative value of `start` and `stop` means the offset from the end
    /// of the list.
    async fn lrange<K: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, start: isize, stop: isize,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::lrange(key, start, stop)).await
    }

    /// Remove the first `count` occurrences of `value` from the `key` list.
    async fn lrem<K: ToRedisArgs + Send, V: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, count: isize, value: V,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::lrem(key, count, value)).await
    }

    /// Set the value of a key with a timeout.
    async fn pset_ex<K: ToRedisArgs + Send, V: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, value: V, milliseconds: u64,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::pset_ex(key, value, milliseconds))
            .await
    }

    /// Push a value to the right of the `key` list.
    async fn rpush<K: ToRedisArgs + Send, V: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, value: V,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::rpush(key, value)).await
    }

    /// Set the value of a key.
    async fn set<K: ToRedisArgs + Send, V: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, value: V,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::set(key, value)).await
    }

    async fn zadd<
        K: ToRedisArgs + Send,
        S: ToRedisArgs + Send,
        M: ToRedisArgs + Send,
        T: FromRedisValue,
    >(
        &mut self, key: K, member: M, score: S,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::zadd(key, member, score)).await
    }

    async fn zadd_multiple<
        K: ToRedisArgs + Send,
        S: ToRedisArgs + Send + Sync,
        M: ToRedisArgs + Send + Sync,
        T: FromRedisValue,
    >(
        &mut self, key: K, items: &'_ [(S, M)],
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::zadd_multiple(key, items))
            .await
    }

    async fn zpopmin<K: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, count: isize,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::zpopmin(key, count)).await
    }

    async fn zrange_withscores<K: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, start: isize, stop: isize,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::zrange_withscores(key, start, stop))
            .await
    }

    async fn zrangebyscore_limit<
        K: ToRedisArgs + Send,
        M: ToRedisArgs + Send,
        MM: ToRedisArgs + Send,
        T: FromRedisValue,
    >(
        &mut self, key: K, min: M, max: MM, offset: isize, count: isize,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::zrangebyscore_limit(
            key, min, max, offset, count,
        ))
        .await
    }

    async fn incr<K: ToRedisArgs + Send, V: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, delta: V,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::incr(key, delta)).await
    }

    async fn expire<K: ToRedisArgs + Send, T: FromRedisValue>(
        &mut self, key: K, seconds: i64,
    ) -> RedisResult<T> {
        self.query_async(redis::Cmd::expire(key, seconds)).await
    }
}

#[async_trait::async_trait]
impl<'a> PooledConnectionLike for PooledConnection<'a> {
    async fn query_async<T: FromRedisValue>(&mut self, cmd: redis::Cmd) -> RedisResult<T> {
        match self {
            Self::Clustered(pooled_con) => pooled_con.query_async(cmd).await,
            Self::NonClustered(pooled_con) => pooled_con.query_async(cmd).await,
        }
    }

    async fn query_async_pipeline<T: FromRedisValue>(
        &mut self, pipe: redis::Pipeline,
    ) -> RedisResult<T> {
        match self {
            Self::Clustered(pooled_con) => pooled_con.query_async_pipeline(pipe).await,
            Self::NonClustered(pooled_con) => pooled_con.query_async_pipeline(pipe).await,
        }
    }
}

pub struct NonClusteredPooledConnection<'a> {
    con: bb8::PooledConnection<'a, RedisMultiplexedConnectionManager>,
}

impl<'a> NonClusteredPooledConnection<'a> {
    pub async fn query_async<T: FromRedisValue>(&mut self, cmd: redis::Cmd) -> RedisResult<T> {
        cmd.query_async(&mut *self.con).await
    }

    pub async fn query_async_pipeline<T: FromRedisValue>(
        &mut self, pipe: redis::Pipeline,
    ) -> RedisResult<T> {
        pipe.query_async(&mut *self.con).await
    }
}

pub struct ClusteredPooledConnection<'a> {
    con: bb8::PooledConnection<'a, RedisClusterConnectionManager>,
}

impl<'a> ClusteredPooledConnection<'a> {
    pub async fn query_async<T: FromRedisValue>(&mut self, cmd: redis::Cmd) -> RedisResult<T> {
        cmd.query_async(&mut *self.con).await
    }

    pub async fn query_async_pipeline<T: FromRedisValue>(
        &mut self, pipe: redis::Pipeline,
    ) -> RedisResult<T> {
        pipe.query_async(&mut *self.con).await
    }
}

#[async_trait::async_trait]
pub trait PoolLike {
    async fn get(&self) -> Result<PooledConnection, RunError<RedisError>>;
}

#[async_trait::async_trait]
impl PoolLike for RedisPool {
    async fn get(&self) -> Result<PooledConnection, RunError<RedisError>> {
        match self {
            Self::Clustered(pool) => pool.get().await,
            Self::NonClustered(pool) => pool.get().await,
        }
    }
}

#[async_trait::async_trait]
impl PoolLike for NonClusteredRedisPool {
    async fn get(&self) -> Result<PooledConnection, RunError<RedisError>> {
        let con = self.pool.get().await?;
        let con = NonClusteredPooledConnection { con };
        Ok(PooledConnection::NonClustered(con))
    }
}

#[async_trait::async_trait]
impl PoolLike for ClusteredRedisPool {
    async fn get(&self) -> Result<PooledConnection, RunError<RedisError>> {
        let con = ClusteredPooledConnection {
            con: self.pool.get().await?,
        };
        Ok(PooledConnection::Clustered(con))
    }
}

/// Create a new redis pool.
///
/// * `nodes` - A list of redis nodes.
/// * `max_connections` - The maximum number of connections in the pool.
pub async fn new_redis_pool(
    nodes: &[String], max_connections: u16,
) -> Result<RedisPool, RedisError> {
    match nodes.len() {
        0 => Err(RedisError::from((
            redis::ErrorKind::InvalidClientConfig,
            "No redis nodes specified",
        ))),
        1 => {
            let mgr = RedisMultiplexedConnectionManager::new(nodes[0].clone())?;
            let pool = Pool::builder()
                .max_size(max_connections.into())
                .build(mgr)
                .await?;
            let pool = NonClusteredRedisPool { pool };
            Ok(RedisPool::NonClustered(pool))
        }
        _ => {
            let mgr = RedisClusterConnectionManager::new(nodes)?;
            let pool = Pool::builder()
                .max_size(max_connections.into())
                .build(mgr)
                .await?;
            let pool = ClusteredRedisPool { pool };
            Ok(RedisPool::Clustered(pool))
        }
    }
}

#[derive(Debug, Error)]
pub enum CacheError<E> {
    #[error("Redis error: {0}")]
    Redis(RedisError),
    #[error("BB8 cluster error: {0}")]
    Bb8(RunError<E>),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("key not found: {0}")]
    KeyNotFound(String),
    #[error("Domain is needed: {0}")]
    DomainNeeded(String),
}

impl From<RedisError> for CacheError<RedisError> {
    fn from(err: RedisError) -> Self {
        Self::Redis(err)
    }
}

impl<E> From<RunError<E>> for CacheError<E> {
    fn from(err: RunError<E>) -> Self {
        Self::Bb8(err)
    }
}

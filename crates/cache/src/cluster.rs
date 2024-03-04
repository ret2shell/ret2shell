use redis::{
    cluster::{ClusterClient, ClusterClientBuilder},
    ErrorKind, IntoConnectionInfo, RedisError,
};

/// ConnectionManager that implements `bb8::ManageConnection` and supports
/// asynchronous clustered connections via `redis_cluster_async::Connection`
#[derive(Clone)]
pub struct RedisClusterConnectionManager {
    client: ClusterClient,
}

impl RedisClusterConnectionManager {
    /// Create a new `RedisClusterConnectionManager` with nodes.
    pub fn new<T: IntoConnectionInfo + Clone>(
        nodes: &[T],
    ) -> Result<RedisClusterConnectionManager, RedisError> {
        Ok(RedisClusterConnectionManager {
            client: ClusterClientBuilder::new(nodes.to_owned())
                .retries(0)
                .build()?,
        })
    }
}

#[async_trait::async_trait]
impl bb8::ManageConnection for RedisClusterConnectionManager {
    type Connection = redis::cluster_async::ClusterConnection;
    type Error = RedisError;

    /// Attempts to create a new connection to the redis.
    async fn connect(&self) -> Result<Self::Connection, Self::Error> {
        self.client.get_async_connection().await
    }

    /// Determines if cached connections are still valid, or if they should be
    async fn is_valid(&self, conn: &mut Self::Connection) -> Result<(), Self::Error> {
        let pong: String = redis::cmd("PING").query_async(&mut *conn).await?;
        match pong.as_str() {
            "PONG" => Ok(()),
            _ => Err((ErrorKind::ResponseError, "ping request").into()),
        }
    }

    /// Synchronously determine if the connection is no longer usable, if
    /// possible. This implemention has no effect and always returns false,
    /// just for bb8 traits.
    fn has_broken(&self, _: &mut Self::Connection) -> bool {
        false
    }
}

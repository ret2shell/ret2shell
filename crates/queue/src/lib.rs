//! Provides message queue for other modules.

use std::time::Duration;

use async_nats::jetstream::{self, consumer::pull::Stream, context::PublishAckFuture};
use r2s_config::queue;
use serde::Serialize;

mod traits;

pub use traits::QueueError;

#[derive(Clone, Debug)]
pub struct Queue {
    context: jetstream::Context,
}

impl Queue {
    pub fn new(context: jetstream::Context) -> Self {
        Self { context }
    }

    pub fn context(&self) -> &jetstream::Context {
        &self.context
    }

    pub async fn publish(
        &self, subject: &'static str, payload: impl Serialize,
    ) -> Result<PublishAckFuture, QueueError> {
        let ack = self
            .context
            .publish(subject, serde_json::to_string(&payload)?.into())
            .await?;
        Ok(ack)
    }

    pub async fn publish_ack(
        &self, subject: &'static str, payload: impl Serialize,
    ) -> Result<(), QueueError> {
        self.publish(subject, payload).await?.await?;
        Ok(())
    }

    pub async fn subscribe(&self, subject: &str) -> Result<Stream, QueueError> {
        let subject = subject.to_string();
        let stream = self
            .context
            .get_or_create_stream(async_nats::jetstream::stream::Config {
                name: subject.clone(),
                max_messages: 10_000,
                ..Default::default()
            })
            .await?;

        let subscriber = stream
            .get_or_create_consumer(
                &subject.clone(),
                async_nats::jetstream::consumer::pull::Config {
                    durable_name: Some(subject),
                    ..Default::default()
                },
            )
            .await?;
        let messages = subscriber
            .stream()
            .max_messages_per_batch(10)
            .messages()
            .await?;
        Ok(messages)
    }
}

pub async fn initialize(config: &Option<queue::Config>) -> Result<Queue, QueueError> {
    let config = config.clone().ok_or(QueueError::ConfigNotFound)?;
    let tls = config.tls.unwrap_or(false);
    let addr = config.addr();
    let mut options = async_nats::ConnectOptions::new().require_tls(tls);
    if let Some(ping_interval) = config.ping_interval {
        options = options.ping_interval(Duration::from_secs(ping_interval));
    }
    if let Some(token) = config.token {
        options = options.token(token);
    } else if let (Some(user), Some(password)) = (config.user, config.password) {
        options = options.user_and_password(user, password)
    }
    let client = options.connect(&addr).await?;
    Ok(Queue::new(jetstream::new(client)))
}

//! Provides message queue for other modules.

use std::time::Duration;

use async_nats::jetstream::{self, consumer::pull::Stream, context::PublishAckFuture};
use chrono::{DateTime, Utc};
use r2s_config::queue;
use serde::{Deserialize, Serialize};

mod traits;

pub use traits::QueueError;

#[derive(Clone, Debug)]
pub struct Queue {
  context: jetstream::Context,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TracedMessage<T> {
  pub trace: String,
  pub created_at: DateTime<Utc>,
  pub payload: T,
}

impl Queue {
  pub fn new(context: jetstream::Context) -> Self {
    Self { context }
  }

  pub fn context(&self) -> &jetstream::Context {
    &self.context
  }

  pub async fn publish(
    &self, subject: &'static str, payload: impl Serialize, trace: impl AsRef<str>,
  ) -> Result<PublishAckFuture, QueueError> {
    let payload = TracedMessage {
      trace: trace.as_ref().to_string(),
      created_at: Utc::now(),
      payload,
    };
    let ack = self
      .context
      .publish(subject, serde_json::to_string(&payload)?.into())
      .await?;
    Ok(ack)
  }

  pub async fn publish_ack(
    &self, subject: &'static str, payload: impl Serialize, trace: impl AsRef<str>,
  ) -> Result<(), QueueError> {
    self.publish(subject, payload, trace).await?.await?;
    Ok(())
  }

  pub async fn subscribe(&self, subject: &str) -> Result<Stream, QueueError> {
    let subject = subject.to_string();
    let stream = self
      .context
      .get_or_create_stream(async_nats::jetstream::stream::Config {
        name: subject.clone(),
        max_messages: 10_000,
        max_age: Duration::from_secs(3600 * 24),
        consumer_limits: Some(async_nats::jetstream::stream::ConsumerLimits {
          inactive_threshold: Duration::from_secs(120),
          max_ack_pending: 3,
        }),
        ..Default::default()
      })
      .await?;

    let consumer = stream
      .get_or_create_consumer(
        &subject.clone(),
        async_nats::jetstream::consumer::pull::Config {
          durable_name: Some(subject),
          max_deliver: 3,
          ack_wait: Duration::from_secs(120),
          ..Default::default()
        },
      )
      .await?;
    let messages = consumer
      .stream()
      .max_messages_per_batch(1)
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

#[cfg(test)]
mod tests {
  use chrono::Utc;

  use super::TracedMessage;

  #[test]
  fn traced_message_round_trips_through_json() {
    let message = TracedMessage {
      trace: "trace-id".to_owned(),
      created_at: Utc::now(),
      payload: vec!["flag-a", "flag-b"],
    };

    let encoded = serde_json::to_string(&message).unwrap();
    let decoded: TracedMessage<Vec<String>> = serde_json::from_str(&encoded).unwrap();

    assert_eq!(decoded.trace, "trace-id");
    assert_eq!(decoded.created_at, message.created_at);
    assert_eq!(
      decoded.payload,
      vec!["flag-a".to_owned(), "flag-b".to_owned()]
    );
  }
}

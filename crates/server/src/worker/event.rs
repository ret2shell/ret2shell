use async_nats::jetstream::{Message, consumer::pull::Stream};
use futures::StreamExt;
use r2s_database::game;
use r2s_event::{
  EventManager,
  events::EventContainer,
};
use r2s_migrator::Database;
use r2s_queue::TracedMessage;
use tracing::{error, warn};

use crate::traits::ResponseError;

pub fn spawn(messages: Stream, manager: EventManager, db: Database) {
  tokio::spawn(event_pusher(messages, manager, db));
}

async fn event_pusher(mut messages: Stream, manager: EventManager, db: Database) {
  let mut retries = 0;
  loop {
    while let Some(message) = messages.next().await {
      if let Ok(message) = message {
        let result = push_event(message.clone(), manager.clone(), &db).await;
        if let Err(error) = result {
          error!(?error, "failed to process event message");
        }
        message.double_ack().await.ok();
      } else {
        error!(?message, "failed to receive event message from nats");
      }
    }
    retries += 1;
    if retries < 5 {
      warn!(
        "event pusher worker stopped unexpectedly! maybe a message queue issue? trying to restart..."
      );
      continue;
    } else {
      error!("event pusher worker stopped unexpectedly for 5 times, exiting...");
      break;
    }
  }
}

async fn push_event(
  message: Message, manager: EventManager, db: &Database,
) -> Result<(), ResponseError> {
  let payload = String::from_utf8(message.message.payload.to_vec())?;
  let event = serde_json::from_str::<TracedMessage<EventContainer>>(&payload)?;
  if game::get(&db.conn, event.payload.game_id)
    .await?
    .is_none()
  {
    warn!(
      game_id = event.payload.game_id,
      "skip event broadcast for missing game",
    );
    return Ok(());
  }
  manager.broadcast(event.payload).await;
  Ok(())
}

use std::{net::IpAddr, sync::Arc};

use axum::{
  body::Bytes,
  extract::ws::{Message, WebSocket},
};
use chrono::{DateTime, Utc};
use events::{Broadcast, EventContainer};
use futures::{SinkExt, StreamExt};
use tokio::sync::{RwLock, broadcast};

pub mod events;
pub use events::Event;
pub mod traits;
use tracing::{info, warn};
pub use traits::EventError;

type EventClient = (i64, String, IpAddr, DateTime<Utc>);

#[derive(Clone, Debug)]
pub struct EventManager {
  tx: broadcast::Sender<Broadcast>,
  pub clients: Arc<RwLock<Vec<EventClient>>>,
}

impl Default for EventManager {
  fn default() -> Self {
    Self::new()
  }
}

impl EventManager {
  pub fn new() -> Self {
    let (tx, _) = broadcast::channel(128);
    Self {
      tx,
      clients: Arc::new(RwLock::new(Vec::new())),
    }
  }

  pub async fn subscribe(&self, id: i64, ip_addr: IpAddr, client: String, ws: WebSocket) {
    let mut rx = self.tx.subscribe();
    let subscribed_time = Utc::now();
    {
      let mut clients = self.clients.write().await;
      clients.push((id, client.clone(), ip_addr, subscribed_time));
    }

    let (mut sink, mut stream) = ws.split();

    tokio::spawn(async move {
      while stream.next().await.is_some() {
        continue;
      }
    });

    while let Ok(event) = rx.recv().await {
      match event {
        Broadcast::Publish(event) => {
          if event.game_id != id {
            continue;
          }
          let message = match serde_json::to_string(&event.event).ok() {
            Some(message) => message,
            None => continue,
          };
          match sink.send(Message::Text(message.into())).await {
            Ok(_) => {}
            Err(error) => {
              warn!(?error, "failed to send message to client");
              break;
            }
          }
        }
        Broadcast::Heartbeat => match sink.send(Message::Ping(Bytes::new())).await {
          Ok(_) => {}
          Err(error) => {
            warn!(?error, "failed to send heartbeat to client");
            break;
          }
        },
      }
    }
    {
      let mut clients = self.clients.write().await;
      info!(?id, ?client, ?ip_addr, "event client disconnected");
      clients
        .retain(|(i, c, a, d)| *i != id || *c != client || *a != ip_addr || *d != subscribed_time);
    }
  }

  pub async fn broadcast(&self, message: EventContainer) {
    self.tx.send(Broadcast::Publish(Box::new(message))).ok();
  }

  pub async fn cry(&self) {
    loop {
      self.tx.send(Broadcast::Heartbeat).ok();
      tokio::time::sleep(std::time::Duration::from_secs(10)).await;
    }
  }
}

pub fn initialize() -> EventManager {
  EventManager::new()
}

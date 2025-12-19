use async_nats::jetstream::{self, consumer::pull::Stream};
use futures::StreamExt;
use r2s_database::{ip, user};
use r2s_migrator::Database;
use r2s_queue::TracedMessage;
use serde::{Deserialize, Serialize};
use tracing::{error, warn};

#[derive(Serialize, Deserialize, Clone)]
pub struct IpRecord {
  pub ip: String,
  pub user_id: i64,
}

pub fn spawn(messages: Stream, db: Database) {
  tokio::spawn(async move { ip_record_worker(messages, db).await });
}

async fn ip_record_worker(mut messages: Stream, db: Database) {
  while let Some(message) = messages.next().await {
    if let Ok(message) = message {
      ip_record_worker_exec(message.clone(), &db)
        .await
        .map_err(|e| error!(error = ?e, "failed to process message"))
        .ok();
      message.double_ack().await.ok();
    } else {
      error!(?message, "failed to receive message from nats");
    }
  }
}

async fn ip_record_worker_exec(message: jetstream::Message, db: &Database) -> anyhow::Result<()> {
  let req = String::from_utf8(message.message.payload.to_vec())?;
  let req = serde_json::from_str::<TracedMessage<IpRecord>>(&req)?;
  let req = req.payload;
  if user::get_ex(&db.conn, req.user_id).await?.is_none() {
    warn!(user_id = req.user_id, "ip record user not found");
    return Ok(());
  }
  let model = ip::get_or_create(&db.conn, &req.ip).await?;
  ip::link_user(&db.conn, req.user_id, model.id).await.ok();
  Ok(())
}

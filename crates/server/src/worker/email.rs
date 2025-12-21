use async_nats::jetstream::{self, consumer::pull::Stream};
use chrono::{Duration, Utc};
use futures::StreamExt;
use r2s_config::email;
use r2s_database::{config, user};
use r2s_email::{EmailError, EmailRequest, EmailType};
use r2s_migrator::Database;
use r2s_queue::TracedMessage;
use tracing::{error, error_span, info, warn};

pub fn spawn(messages: Stream, db: Database) {
  tokio::spawn(email_worker(messages, db));
}

async fn email_worker(mut messages: Stream, db: Database) {
  let mut retries = 0;
  loop {
    while let Some(message) = messages.next().await {
      retries = 0;
      if let Ok(message) = message {
        process_message(message, &db)
          .await
          .inspect_err(|error| error!(?error, "failed to process NATS email message"))
          .ok();
      } else {
        error!(?message, "failed to receive email message from nats");
      }
    }
    retries += 1;
    if retries < 5 {
      warn!("email worker stopped unexpectedly! maybe a message queue issue? trying to restart...");
      continue;
    } else {
      error!("email worker stopped unexpectedly for 5 times, exiting...");
      return;
    }
  }
}

async fn resolve_email_config(db: &Database) -> Option<email::Config> {
  match config::get(&db.conn).await {
    Ok(Some(config)) => config.email.filter(|c| c.enabled),
    Ok(None) => None,
    Err(error) => {
      error!(error=?error, "failed to load email config from database");
      None
    }
  }
}

async fn process_message(message: jetstream::Message, db: &Database) -> Result<(), EmailError> {
  let email = String::from_utf8(message.message.payload.to_vec())?;
  let req = serde_json::from_str::<TracedMessage<EmailRequest>>(&email)?;
  let span = error_span!("request", trace=%req.trace);
  let span_guard = span.enter();
  let mut req = req.payload;
  if Utc::now().signed_duration_since(req.created_at) > Duration::hours(1) {
    warn!("email message expired, dropping");
    message.double_ack().await.ok();
    drop(span_guard);
    return Ok(());
  }
  if matches!(req.email_type, EmailType::Verify)
    && let Ok(Some(user)) = user::get_by_account_or_email(&db.conn, &req.email.email).await
    && user.permissions.0.contains(&user::Permission::Verified)
  {
    warn!("verification email for verified account, dropping");
    message.double_ack().await.ok();
    drop(span_guard);
    return Ok(());
  }

  let Some(config) = resolve_email_config(db).await else {
    warn!("email config missing or disabled, dropping message");
    message.double_ack().await.ok();
    drop(span_guard);
    return Ok(());
  };
  req.config = config;
  let mut retry_count = 3;
  while retry_count > 0 {
    if let Err(err) = r2s_email::send(&req).await {
      warn!(
        email = %req.email.email,
        subject = %req.email.subject,
        error = ?err,
        "failed to send email, retrying...",
      );
      retry_count -= 1;
    } else {
      info!(
        email = %req.email.email,
        subject = %req.email.subject,
        "successfully sent email",
      );
      break;
    }
  }
  if retry_count == 0 {
    error!(
      email = %req.email.email,
      subject = %req.email.subject,
      "failed to send email after 3 retries, dropped.",
    );
  }
  message
    .double_ack()
    .await
    .inspect_err(|e| error!(error=?e, "failed to drop NATS email message"))
    .ok();
  drop(span_guard);
  Ok(())
}

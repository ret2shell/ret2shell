use async_nats::jetstream::{self, consumer::pull::Stream};
use futures::StreamExt;
use lettre::{
  AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
  message::{Mailbox, SinglePart, header},
  transport::smtp::{
    authentication::Credentials,
    client::{Tls, TlsParameters},
  },
};
use r2s_config::email;
use r2s_queue::TracedMessage;
use tracing::{debug, error, error_span, info, warn};

use super::traits::{EmailCtx, EmailError, EmailRequest};

fn construct_email(
  email: &EmailCtx, sender_name: impl AsRef<str>, sender_email: impl AsRef<str>,
) -> Result<Message, EmailError> {
  let envelope = Message::builder()
    .from(Mailbox::new(
      Some(sender_name.as_ref().to_string()),
      sender_email.as_ref().parse()?,
    ))
    .to(Mailbox::new(
      Some(email.name.to_string()),
      email.email.parse()?,
    ))
    .subject(&email.subject)
    .singlepart(
      SinglePart::builder()
        .header(header::ContentType::TEXT_HTML)
        .body(String::from(&email.content)),
    )?;
  Ok(envelope)
}

async fn send_email_impl(config: &email::Config, email: &EmailCtx) -> Result<(), EmailError> {
  let smtp_credentials = Credentials::new(config.username.clone(), config.password.clone());
  debug!(?config, "connect smtp server with smtp_credentials");
  let mailer: AsyncSmtpTransport<Tokio1Executor> = match config.tls.as_str() {
    "starttls" => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host),
    "tls" => Ok(
      AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)?.tls(Tls::Wrapper(
        TlsParameters::builder(config.host.clone()).build().unwrap(),
      )),
    ),
    "none" => Ok(AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(
      &config.host,
    )),
    _ => return Err(EmailError::InvalidEmailTlsConfiguration(config.tls.clone())),
  }?
  .port(config.port)
  .credentials(smtp_credentials)
  .timeout(Some(std::time::Duration::from_secs(10)))
  .build();

  debug!(?mailer, "send with mailer");
  let email = construct_email(
    email,
    &config.sender,
    config.sender_address.as_ref().unwrap_or(&config.username),
  )?;
  debug!(?email, "constructed email");
  mailer.send(email).await?;
  debug!("email sent");
  Ok(())
}

async fn process_message(message: jetstream::Message) -> Result<(), EmailError> {
  let email = String::from_utf8(message.message.payload.to_vec())?;
  let req = serde_json::from_str::<TracedMessage<EmailRequest>>(&email)?;
  let span = error_span!("request", trace=%req.trace);
  let span_guard = span.enter();
  let req = req.payload;
  let mut retry_count = 3;
  while retry_count > 0 {
    if let Err(err) = send_email_impl(&req.config, &req.email).await {
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
  if retry_count < 0 {
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

pub async fn email_worker(mut messages: Stream) {
  let mut retries = 0;
  loop {
    while let Some(message) = messages.next().await {
      retries = 0;
      if let Ok(message) = message {
        process_message(message)
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

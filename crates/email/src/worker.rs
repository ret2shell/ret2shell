use async_nats::jetstream::{self, consumer::pull::Stream, AckKind};
use futures::StreamExt;
use lettre::{
  message::{header, SinglePart},
  transport::smtp::{
    authentication::Credentials,
    client::{Tls, TlsParameters},
  },
  AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use r2s_config::email;
use tracing::{debug, error, info, warn};

use super::traits::{EmailCtx, EmailError, EmailRequest};

fn construct_email(
  email: &EmailCtx, sender_name: impl AsRef<str>, sender_email: impl AsRef<str>,
) -> Result<Message, EmailError> {
  let envelope = Message::builder()
    .from(format!("{} <{}>", sender_name.as_ref(), sender_email.as_ref()).parse()?)
    .to(format!("{} <{}>", email.name, email.email).parse()?)
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
  debug!("smtp_credentials: {} {}", config.username, config.password);
  debug!("smtp host: {} {}:{}", config.tls, config.host, config.port);
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

  debug!("mailer: {:?}", mailer);
  let email = construct_email(email, &config.sender, &config.username)?;
  debug!("email: {:?}", email);
  mailer.send(email).await?;
  debug!("email sent");
  Ok(())
}

async fn process_message(message: jetstream::Message) -> Result<(), EmailError> {
  let email = String::from_utf8(message.message.payload.to_vec())?;
  let req = serde_json::from_str::<EmailRequest>(&email)?;
  let mut retry_count = 3;
  while retry_count > 0 {
    if let Err(err) = send_email_impl(&req.config, &req.email).await {
      warn!(
        "Failed to send email '{}' to <{}>, error with: {:?}, retrying...",
        req.email.subject, req.email.email, err
      );
      retry_count -= 1;
    } else {
      info!(
        "Successfully sent email: '{}' to <{}>",
        req.email.subject, req.email.email
      );
      message
        .ack_with(AckKind::Ack)
        .await
        .inspect_err(|e| error!("Failed to ack message: {:?}", e))
        .ok();
      return Ok(());
    }
  }
  error!(
    "Failed to send email '{}' to <{}> after 3 retries, dropped.",
    req.email.subject, req.email.email
  );
  message.ack_with(AckKind::Term).await.ok();
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
          .inspect_err(|e| error!("Failed to process message: {:?}", e))
          .ok();
      } else {
        error!("Failed to receive message from nats: {:?}", message);
      }
    }
    retries += 1;
    if retries < 5 {
      warn!("Email worker stopped unexpectedly! Maybe a message queue issue? Trying to restart...");
      continue;
    } else {
      error!("Email worker stopped unexpectedly for 5 times, exiting...");
      return;
    }
  }
}

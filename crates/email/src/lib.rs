mod traits;
pub use traits::{EmailCtx, EmailError, EmailRequest, EmailType};

use lettre::{
  AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
  message::{Mailbox, SinglePart, header},
  transport::smtp::{
    authentication::Credentials,
    client::{Tls, TlsParameters},
  },
};
use r2s_config::email;
use tracing::debug;

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

pub async fn send(req: &EmailRequest) -> Result<(), EmailError> {
  send_email_impl(&req.config, &req.email).await
}

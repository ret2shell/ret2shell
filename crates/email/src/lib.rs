mod traits;
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
pub use traits::{EmailCtx, EmailError, EmailRequest, EmailType};

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

#[cfg(test)]
mod tests {
  use r2s_config::email::Config;

  use super::{EmailCtx, construct_email, send};

  fn email_config(tls: &str) -> Config {
    Config {
      enabled: true,
      host: "smtp.example.com".to_owned(),
      port: 465,
      sender: "Ret2Shell".to_owned(),
      sender_address: Some("no-reply@example.com".to_owned()),
      username: "no-reply@example.com".to_owned(),
      password: "secret".to_owned(),
      tls: tls.to_owned(),
      reset_password_email_body: None,
      reset_password_email_subject: None,
      verify_email_body: None,
      verify_email_subject: None,
    }
  }

  fn email_ctx() -> EmailCtx {
    EmailCtx {
      name: "Player".to_owned(),
      email: "player@example.com".to_owned(),
      subject: "verify".to_owned(),
      content: "code: 114514".to_owned(),
    }
  }

  #[test]
  fn construct_email_builds_envelope_with_sender_fallback() {
    let envelope = construct_email(&email_ctx(), "Ret2Shell", "no-reply@example.com").unwrap();
    let headers = envelope.headers();
    assert!(format!("{headers:?}").contains("player@example.com"));
  }

  #[tokio::test]
  async fn send_rejects_unknown_tls_mode_before_any_network_io() {
    let request = crate::EmailRequest {
      email: email_ctx(),
      config: email_config("not-a-tls-mode"),
      email_type: crate::EmailType::Verify,
    };

    let err = send(&request).await.unwrap_err();

    assert!(matches!(
      err,
      crate::EmailError::InvalidEmailTlsConfiguration(mode) if mode == "not-a-tls-mode"
    ));
  }
}

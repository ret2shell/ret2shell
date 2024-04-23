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
) -> Message {
    Message::builder()
        .from(
            format!("{} <{}>", sender_name.as_ref(), sender_email.as_ref())
                .parse()
                .unwrap(),
        )
        .to(format!("{} <{}>", email.name, email.email).parse().unwrap())
        .subject(&email.subject)
        .singlepart(
            SinglePart::builder()
                .header(header::ContentType::TEXT_HTML)
                .body(String::from(&email.content)),
        )
        .unwrap()
}

async fn send_email_impl(config: &email::Config, email: &EmailCtx) -> Result<(), EmailError> {
    let smtp_credentials = Credentials::new(config.username.clone(), config.password.clone());
    debug!("smtp_credentials: {} {}", config.username, config.password);
    debug!("smtp host: {} {}:{}", config.tls, config.host, config.port);
    debug!("email: {:?}", email);
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
    .build();
    let email = construct_email(email, &config.sender, &config.username);
    mailer.send(email).await?;
    Ok(())
}

async fn process_message(message: jetstream::Message) -> Result<(), EmailError> {
    let email = String::from_utf8(message.message.payload.to_vec())?;
    let req = serde_json::from_str::<EmailRequest>(&email)?;
    let mut retry_count = 3;
    while retry_count > 0 {
        if let Err(err) = send_email_impl(&req.config, &req.email).await {
            warn!("Failed to send email: {:?}", err);
            retry_count -= 1;
        } else {
            info!("Successfully sent email: {:?}", req);
            message.ack_with(AckKind::Ack).await.ok();
            return Ok(());
        }
    }
    error!("Failed to send email {req:?} after 3 retries, dropped.");
    message.ack_with(AckKind::Term).await.ok();
    Ok(())
}

pub async fn email_worker(mut messages: Stream) {
    while let Some(message) = messages.next().await {
        if let Ok(message) = message {
            process_message(message)
                .await
                .map_err(|e| error!("Failed to process message: {:?}", e))
                .ok();
        } else {
            error!("Failed to receive message from nats: {:?}", message);
        }
    }
}

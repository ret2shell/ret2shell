use async_nats::jetstream::consumer::pull::Stream;
use futures::StreamExt;
use lettre::{
    message::{header, SinglePart},
    transport::smtp::{
        authentication::Credentials,
        client::{Tls, TlsParameters},
    },
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use tracing::{debug, error, info};

use super::traits::{EmailConfig, EmailCtx, EmailError, EmailRequest};

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

async fn send_email_impl(config: &EmailConfig, email: &EmailCtx) -> Result<(), EmailError> {
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
    let email = construct_email(&email, &config.sender, &config.username);
    mailer.send(email).await?;
    Ok(())
}

pub async fn email_worker(mut messages: Stream) -> Result<(), EmailError> {
    while let Some(message) = messages.next().await {
        if let Ok(message) = message {
            let email = String::from_utf8(message.message.payload.to_vec());
            if let Ok(email) = email {
                if let Ok(req) = serde_json::from_str::<EmailRequest>(&email) {
                    if let Err(err) = send_email_impl(&req.config, &req.email).await {
                        error!("Failed to send email: {:?}", err);
                    } else {
                        info!("Successfully sent email: {:?}", req);
                        message.ack().await.ok();
                    }
                } else {
                    error!("Failed to deserialize email: {:?}", email);
                }
            } else {
                error!("Failed to convert email message to string: {:?}", email);
            }
        } else {
            error!("Failed to receive message from nats: {:?}", message);
        }
    }
    Ok(())
}

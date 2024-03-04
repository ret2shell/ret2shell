use async_nats::jetstream::consumer::pull::Stream;

mod traits;
mod worker;

pub use traits::{EmailConfig, EmailCtx, EmailError, EmailRequest};
use worker::email_worker;

pub async fn initialize(messages: Stream) -> Result<(), EmailError> {
    let future = email_worker(messages);
    tokio::spawn(future);
    Ok(())
}

use clap::Args;

use crate::{client::Client, error::CliResult, output::print_json};

#[derive(Args, Debug)]
pub struct PingCommand;

impl PingCommand {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    print_json(client.get("/ping", &[]).await?, json)
  }
}

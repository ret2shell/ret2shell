use clap::{Args, Subcommand};
use reqwest::Method;

use crate::{
  client::Client, commands::common::JsonBodyArgs, error::CliResult, output::print_value,
};

#[derive(Args, Debug)]
pub struct PlatformCommands {
  #[command(subcommand)]
  command: PlatformCommand,
}

#[derive(Subcommand, Debug)]
enum PlatformCommand {
  Info,
  Version,
  Auth,
  Config,
  Statistics,
  License,
  Logs(LogsArgs),
  Log(LogArgs),
  UpdateConfig(BodyArgs),
}

#[derive(Args, Debug)]
struct LogsArgs {
  #[arg(long)]
  file: Option<String>,
}

#[derive(Args, Debug)]
struct LogArgs {
  file: String,
  #[arg(long)]
  offset: Option<i64>,
  #[arg(long)]
  limit: Option<u64>,
}

#[derive(Args, Debug)]
struct BodyArgs {
  #[command(flatten)]
  body: JsonBodyArgs,
}

impl PlatformCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      PlatformCommand::Info => client.get("/platform/info", &[]).await?,
      PlatformCommand::Version => client.get("/platform/version", &[]).await?,
      PlatformCommand::Auth => client.get("/platform/auth", &[]).await?,
      PlatformCommand::Config => client.get("/platform/config", &[]).await?,
      PlatformCommand::Statistics => client.get("/platform/statistics", &[]).await?,
      PlatformCommand::License => client.get("/platform/license", &[]).await?,
      PlatformCommand::Logs(args) => {
        let mut query = Vec::new();
        if let Some(file) = args.file {
          query.push(("file", file));
        }
        client.get("/platform/logs", &query).await?
      }
      PlatformCommand::Log(args) => {
        let mut query = vec![("file", args.file)];
        if let Some(offset) = args.offset {
          query.push(("offset", offset.to_string()));
        }
        if let Some(limit) = args.limit {
          query.push(("limit", limit.to_string()));
        }
        client.get("/platform/logs/query", &query).await?
      }
      PlatformCommand::UpdateConfig(args) => {
        let body = args.body.required()?;
        client
          .send_json(Method::PATCH, "/platform/config", &[], Some(&body))
          .await?
      }
    };
    print_value(value, json)
  }
}

use clap::{Args, Subcommand};
use reqwest::Method;

use crate::{
  client::Client,
  commands::common::{optional_json, parse_query, print, query_refs},
  error::CliResult,
};

#[derive(Args, Debug)]
pub struct ApiCommands {
  #[command(subcommand)]
  command: ApiCommand,
}

#[derive(Subcommand, Debug)]
enum ApiCommand {
  Get(RequestArgs),
  Post(BodyRequestArgs),
  Patch(BodyRequestArgs),
  Delete(BodyRequestArgs),
}

#[derive(Args, Debug)]
struct RequestArgs {
  path: String,
  #[arg(short, long = "query")]
  query: Vec<String>,
}

#[derive(Args, Debug)]
struct BodyRequestArgs {
  path: String,
  #[arg(short, long = "query")]
  query: Vec<String>,
  #[arg(long)]
  body: Option<String>,
  #[arg(long)]
  body_file: Option<String>,
}

impl ApiCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      ApiCommand::Get(args) => {
        let query = parse_query(args.query)?;
        client.get(&args.path, &query_refs(&query)).await?
      }
      ApiCommand::Post(args) => send_body(client, Method::POST, args).await?,
      ApiCommand::Patch(args) => send_body(client, Method::PATCH, args).await?,
      ApiCommand::Delete(args) => send_body(client, Method::DELETE, args).await?,
    };
    print(value, json)
  }
}

async fn send_body(
  client: &Client, method: Method, args: BodyRequestArgs,
) -> CliResult<serde_json::Value> {
  let query = parse_query(args.query)?;
  let body = optional_json(args.body, args.body_file)?;
  client
    .send_json(method, &args.path, &query_refs(&query), body.as_ref())
    .await
}

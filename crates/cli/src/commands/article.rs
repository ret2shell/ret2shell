use clap::{Args, Subcommand};
use reqwest::Method;

use crate::{
  client::Client, commands::common::JsonBodyArgs, error::CliResult, output::print_value,
};

#[derive(Args, Debug)]
pub struct BulletinCommands {
  #[command(subcommand)]
  command: ArticleCommand,
}

#[derive(Args, Debug)]
pub struct WikiCommands {
  #[command(subcommand)]
  command: ArticleCommand,
}

#[derive(Subcommand, Debug)]
enum ArticleCommand {
  List(ListArgs),
  Get(GetArgs),
  Create(BodyArgs),
  Update(UpdateArgs),
  Delete(GetArgs),
}

#[derive(Args, Debug)]
struct ListArgs {
  #[arg(long)]
  page: Option<u64>,
  #[arg(long)]
  page_size: Option<u64>,
}

#[derive(Args, Debug)]
struct GetArgs {
  article: i64,
}

#[derive(Args, Debug)]
struct BodyArgs {
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct UpdateArgs {
  article: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

impl BulletinCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    run_article(client, "bulletin", self.command, json).await
  }
}

impl WikiCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    run_article(client, "wiki", self.command, json).await
  }
}

async fn run_article(
  client: &Client, resource: &str, command: ArticleCommand, json: bool,
) -> CliResult<()> {
  let value = match command {
    ArticleCommand::List(args) => {
      client
        .get(&format!("/{resource}"), &list_query(args))
        .await?
    }
    ArticleCommand::Get(args) => {
      client
        .get(&format!("/{resource}/{}", args.article), &[])
        .await?
    }
    ArticleCommand::Create(args) => {
      let body = args.body.required()?;
      client
        .send_json(Method::POST, &format!("/{resource}"), &[], Some(&body))
        .await?
    }
    ArticleCommand::Update(args) => {
      let body = args.body.required()?;
      client
        .send_json(
          Method::PATCH,
          &format!("/{resource}/{}", args.article),
          &[],
          Some(&body),
        )
        .await?
    }
    ArticleCommand::Delete(args) => {
      client
        .send_json(
          Method::DELETE,
          &format!("/{resource}/{}", args.article),
          &[],
          None,
        )
        .await?
    }
  };
  print_value(value, json)
}

fn list_query(args: ListArgs) -> Vec<(&'static str, String)> {
  let mut query = Vec::new();
  if let Some(page) = args.page {
    query.push(("page", page.to_string()));
  }
  if let Some(page_size) = args.page_size {
    query.push(("page_size", page_size.to_string()));
  }
  query
}

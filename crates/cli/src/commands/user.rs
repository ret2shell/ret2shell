use clap::{Args, Subcommand};
use reqwest::Method;

use crate::{
  client::Client, commands::common::JsonBodyArgs, error::CliResult, output::print_value,
};

#[derive(Args, Debug)]
pub struct UserCommands {
  #[command(subcommand)]
  command: UserCommand,
}

#[derive(Subcommand, Debug)]
enum UserCommand {
  List(ListArgs),
  Get(UserArgs),
  Teams(UserArgs),
  Ips(UserArgs),
  OAuth(UserArgs),
  Update(UpdateArgs),
  Delete(UserArgs),
}

#[derive(Args, Debug)]
struct ListArgs {
  #[arg(long)]
  page: Option<u64>,
  #[arg(long)]
  page_size: Option<u64>,
  #[arg(long)]
  order: Option<String>,
  #[arg(long)]
  filter: Option<String>,
  #[arg(long)]
  institute_id: Option<i64>,
}

#[derive(Args, Debug)]
struct UserArgs {
  user: i64,
}

#[derive(Args, Debug)]
struct UpdateArgs {
  user: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

impl UserCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      UserCommand::List(args) => client.get("/user", &list_query(args)).await?,
      UserCommand::Get(args) => client.get(&format!("/user/{}", args.user), &[]).await?,
      UserCommand::Teams(args) => {
        client
          .get(&format!("/user/{}/team", args.user), &[])
          .await?
      }
      UserCommand::Ips(args) => client.get(&format!("/user/{}/ip", args.user), &[]).await?,
      UserCommand::OAuth(args) => {
        client
          .get(&format!("/user/{}/oauth", args.user), &[])
          .await?
      }
      UserCommand::Update(args) => {
        let body = args.body.required()?;
        client
          .send_json(
            Method::PATCH,
            &format!("/user/{}", args.user),
            &[],
            Some(&body),
          )
          .await?
      }
      UserCommand::Delete(args) => {
        client
          .send_json(Method::DELETE, &format!("/user/{}", args.user), &[], None)
          .await?
      }
    };
    print_value(value, json)
  }
}

fn list_query(args: ListArgs) -> Vec<(&'static str, String)> {
  let mut query = Vec::new();
  if let Some(page) = args.page {
    query.push(("page", page.to_string()));
  }
  if let Some(page_size) = args.page_size {
    query.push(("page_size", page_size.to_string()));
  }
  if let Some(order) = args.order {
    query.push(("order", order));
  }
  if let Some(filter) = args.filter {
    query.push(("filter", filter));
  }
  if let Some(institute_id) = args.institute_id {
    query.push(("institute_id", institute_id.to_string()));
  }
  query
}

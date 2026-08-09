use clap::{Args, Subcommand};
use reqwest::Method;

use crate::{
  client::Client, commands::common::JsonBodyArgs, error::CliResult, output::print_value,
};

#[derive(Args, Debug)]
pub struct CalendarCommands {
  #[command(subcommand)]
  command: CalendarCommand,
}

#[derive(Subcommand, Debug)]
enum CalendarCommand {
  List(ListArgs),
  Get(GetArgs),
  Create(BodyArgs),
  Update(UpdateArgs),
  Delete(GetArgs),
}

#[derive(Args, Debug)]
struct ListArgs {
  #[arg(long)]
  start_time: i64,
  #[arg(long)]
  end_time: i64,
}

#[derive(Args, Debug)]
struct GetArgs {
  calendar: i64,
}

#[derive(Args, Debug)]
struct BodyArgs {
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct UpdateArgs {
  calendar: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

impl CalendarCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      CalendarCommand::List(args) => {
        client
          .get(
            "/calendar",
            &[
              ("start_time", args.start_time.to_string()),
              ("end_time", args.end_time.to_string()),
            ],
          )
          .await?
      }
      CalendarCommand::Get(args) => {
        client
          .get(&format!("/calendar/{}", args.calendar), &[])
          .await?
      }
      CalendarCommand::Create(args) => {
        let body = args.body.required()?;
        client
          .send_json(Method::POST, "/calendar", &[], Some(&body))
          .await?
      }
      CalendarCommand::Update(args) => {
        let body = args.body.required()?;
        client
          .send_json(
            Method::PATCH,
            &format!("/calendar/{}", args.calendar),
            &[],
            Some(&body),
          )
          .await?
      }
      CalendarCommand::Delete(args) => {
        client
          .send_json(
            Method::DELETE,
            &format!("/calendar/{}", args.calendar),
            &[],
            None,
          )
          .await?
      }
    };
    print_value(value, json)
  }
}

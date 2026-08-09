use clap::{Args, Subcommand};

use crate::{client::Client, error::CliResult, output::print_json};

#[derive(Args, Debug)]
pub struct SubmissionCommands {
  #[command(subcommand)]
  command: SubmissionCommand,
}

#[derive(Subcommand, Debug)]
enum SubmissionCommand {
  List(ListArgs),
}

#[derive(Args, Debug)]
struct ListArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  page: Option<u64>,
  #[arg(long)]
  page_size: Option<u64>,
}

impl SubmissionCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      SubmissionCommand::List(args) => {
        client
          .get_typed::<(Vec<r2s_database::submission::ExModel>, u64)>(
            &format!("/game/{}/submission", args.game),
            &list_query(args),
          )
          .await?
      }
    };
    print_json(value, json)
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
  query
}

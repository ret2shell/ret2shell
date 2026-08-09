use clap::{Args, Subcommand};
use reqwest::Method;
use serde_json::json;

use crate::{client::Client, commands::common::JsonBodyArgs, error::CliResult, output::print_json};

#[derive(Args, Debug)]
pub struct ChallengeCommands {
  #[command(subcommand)]
  command: ChallengeCommand,
}

#[derive(Subcommand, Debug)]
enum ChallengeCommand {
  List(ListArgs),
  Get(GetArgs),
  Create(ChallengeBodyArgs),
  Update(UpdateArgs),
  Delete(GetArgs),
  Publish(GetArgs),
  Unpublish(GetArgs),
  History(GetArgs),
  Submissions(SubmissionsArgs),
  Answer(GetArgs),
  Env(GetArgs),
  Instances(GetArgs),
  Checker(CheckerArgs),
  UpdateChecker(UpdateCheckerArgs),
  Files(FilesArgs),
  UploadFile(UploadFileArgs),
  DownloadFile(DownloadFileArgs),
  DeleteFile(DeleteFileArgs),
  Hints(GetArgs),
  CreateHint(UpdateArgs),
  DeleteHint(DeleteHintArgs),
  UnlockHint(UnlockHintArgs),
  SolveStatus(SolveStatusArgs),
  Submit(SubmitArgs),
  Start(GetArgs),
  Delay(GetArgs),
  Stop(GetArgs),
  UpdateAnswer(UpdateArgs),
  UpdateEnv(UpdateArgs),
  DeleteEnv(GetArgs),
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

#[derive(Args, Debug)]
struct GetArgs {
  #[arg(long)]
  game: i64,
  challenge: i64,
}

#[derive(Args, Debug)]
struct ChallengeBodyArgs {
  #[arg(long)]
  game: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct UpdateArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct SubmissionsArgs {
  #[arg(long)]
  game: i64,
  challenge: i64,
  #[arg(long)]
  page: Option<u64>,
  #[arg(long)]
  page_size: Option<u64>,
  #[arg(long)]
  only_solved: Option<bool>,
}

#[derive(Args, Debug)]
struct CheckerArgs {
  #[arg(long)]
  game: i64,
  challenge: i64,
  #[arg(long)]
  lint: bool,
}

#[derive(Args, Debug)]
struct UpdateCheckerArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  content: String,
}

#[derive(Args, Debug)]
struct DeleteHintArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  hint: i64,
}

#[derive(Args, Debug)]
struct FilesArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  #[arg(long)]
  folder: Option<String>,
  #[arg(long)]
  all: bool,
}

#[derive(Args, Debug)]
struct DeleteFileArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  #[arg(long)]
  folder: String,
  file: String,
}

#[derive(Args, Debug)]
struct DownloadFileArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  #[arg(long)]
  folder: String,
  file: String,
  #[arg(short, long)]
  output: String,
}

#[derive(Args, Debug)]
struct UploadFileArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  #[arg(long)]
  folder: String,
  file: String,
}

#[derive(Args, Debug)]
struct UnlockHintArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  hint: i64,
}

#[derive(Args, Debug)]
struct SolveStatusArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  #[arg(long)]
  submission: Option<i64>,
}

#[derive(Args, Debug)]
struct SubmitArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

impl ChallengeCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    match self.command {
      ChallengeCommand::List(args) => {
        let value = client
          .get_typed::<(Vec<r2s_database::challenge::Model>, u64)>(
            &format!("/game/{}/challenge", args.game),
            &list_query(args),
          )
          .await?;
        print_json(value, json)
      }
      ChallengeCommand::Get(args) => {
        let value = client
          .get_typed::<r2s_database::challenge::Model>(
            &format!("/game/{}/challenge/{}", args.game, args.challenge),
            &[],
          )
          .await?;
        print_json(value, json)
      }
      ChallengeCommand::Create(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::POST,
              &format!("/game/{}/challenge", args.game),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::Update(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/challenge/{}", args.game, args.challenge),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::Delete(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/challenge/{}", args.game, args.challenge),
            &[],
            None,
          )
          .await?,
        json,
      ),
      ChallengeCommand::Publish(args) => send_publish(client, Method::POST, &args)
        .await
        .and_then(|value| print_json(value, json)),
      ChallengeCommand::Unpublish(args) => send_publish(client, Method::DELETE, &args)
        .await
        .and_then(|value| print_json(value, json)),
      ChallengeCommand::History(args) => print_json(
        client
          .get(
            &format!("/game/{}/challenge/{}/history", args.game, args.challenge),
            &[],
          )
          .await?,
        json,
      ),
      ChallengeCommand::Submissions(args) => {
        let query = submissions_query(&args);
        print_json(
          client
            .get(
              &format!(
                "/game/{}/challenge/{}/submission",
                args.game, args.challenge
              ),
              &query,
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::Answer(args) => print_json(
        client
          .get(
            &format!("/game/{}/challenge/{}/answer", args.game, args.challenge),
            &[],
          )
          .await?,
        json,
      ),
      ChallengeCommand::Env(args) => print_json(
        client
          .get(
            &format!("/game/{}/challenge/{}/env", args.game, args.challenge),
            &[],
          )
          .await?,
        json,
      ),
      ChallengeCommand::Instances(args) => print_json(
        client
          .get(
            &format!("/game/{}/challenge/{}/instance", args.game, args.challenge),
            &[],
          )
          .await?,
        json,
      ),
      ChallengeCommand::Checker(args) => {
        let query = if args.lint {
          vec![("lint", "true".to_owned())]
        } else {
          Vec::new()
        };
        print_json(
          client
            .get(
              &format!("/game/{}/challenge/{}/checker", args.game, args.challenge),
              &query,
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::UpdateChecker(args) => print_json(
        client
          .send_json(
            Method::PATCH,
            &format!("/game/{}/challenge/{}/checker", args.game, args.challenge),
            &[],
            Some(&json!({ "content": args.content })),
          )
          .await?,
        json,
      ),
      ChallengeCommand::Files(args) => {
        let mut query = Vec::new();
        if let Some(folder) = args.folder {
          query.push(("folder", folder));
        }
        if args.all {
          query.push(("all", "true".to_owned()));
        }
        print_json(
          client
            .get(
              &format!("/game/{}/challenge/{}/file", args.game, args.challenge),
              &query,
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::UploadFile(args) => print_json(
        client
          .upload_file(
            &format!("/game/{}/challenge/{}/file", args.game, args.challenge),
            &[("folder", args.folder)],
            &args.file,
          )
          .await?,
        json,
      ),
      ChallengeCommand::DownloadFile(args) => print_json(
        client
          .download(
            &format!("/game/{}/challenge/{}/file", args.game, args.challenge),
            &[("folder", args.folder), ("file", args.file)],
            &args.output,
          )
          .await?,
        json,
      ),
      ChallengeCommand::DeleteFile(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/challenge/{}/file", args.game, args.challenge),
            &[("folder", args.folder), ("file", args.file)],
            None,
          )
          .await?,
        json,
      ),
      ChallengeCommand::Hints(args) => print_json(
        client
          .get(
            &format!("/game/{}/challenge/{}/hint", args.game, args.challenge),
            &[],
          )
          .await?,
        json,
      ),
      ChallengeCommand::CreateHint(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::POST,
              &format!("/game/{}/challenge/{}/hint", args.game, args.challenge),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::DeleteHint(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/challenge/{}/hint", args.game, args.challenge),
            &[("id", args.hint.to_string())],
            None,
          )
          .await?,
        json,
      ),
      ChallengeCommand::UnlockHint(args) => print_json(
        client
          .send_json(
            Method::POST,
            &format!(
              "/game/{}/challenge/{}/hint/unlock",
              args.game, args.challenge
            ),
            &[],
            Some(&json!({ "id": args.hint })),
          )
          .await?,
        json,
      ),
      ChallengeCommand::SolveStatus(args) => {
        let query = if let Some(id) = args.submission {
          vec![("id", id.to_string())]
        } else {
          Vec::new()
        };
        print_json(
          client
            .get(
              &format!("/game/{}/challenge/{}/submit", args.game, args.challenge),
              &query,
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::Submit(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::POST,
              &format!("/game/{}/challenge/{}/submit", args.game, args.challenge),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::Start(args) => send_empty(client, Method::POST, &args)
        .await
        .and_then(|value| print_json(value, json)),
      ChallengeCommand::Delay(args) => send_empty(client, Method::PATCH, &args)
        .await
        .and_then(|value| print_json(value, json)),
      ChallengeCommand::Stop(args) => send_empty(client, Method::DELETE, &args)
        .await
        .and_then(|value| print_json(value, json)),
      ChallengeCommand::UpdateAnswer(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/challenge/{}/answer", args.game, args.challenge),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::UpdateEnv(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/challenge/{}/env", args.game, args.challenge),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      ChallengeCommand::DeleteEnv(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/challenge/{}/env", args.game, args.challenge),
            &[],
            None,
          )
          .await?,
        json,
      ),
    }
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

fn submissions_query(args: &SubmissionsArgs) -> Vec<(&'static str, String)> {
  let mut query = Vec::new();
  if let Some(page) = args.page {
    query.push(("page", page.to_string()));
  }
  if let Some(page_size) = args.page_size {
    query.push(("page_size", page_size.to_string()));
  }
  if let Some(only_solved) = args.only_solved {
    query.push(("only_solved", only_solved.to_string()));
  }
  query
}

async fn send_empty(
  client: &Client, method: Method, args: &GetArgs,
) -> CliResult<serde_json::Value> {
  client
    .send_json(
      method,
      &format!("/game/{}/challenge/{}/instance", args.game, args.challenge),
      &[],
      None,
    )
    .await
}

async fn send_publish(
  client: &Client, method: Method, args: &GetArgs,
) -> CliResult<serde_json::Value> {
  client
    .send_json(
      method,
      &format!("/game/{}/challenge/{}/publish", args.game, args.challenge),
      &[],
      None,
    )
    .await
}

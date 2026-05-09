use clap::{Args, Subcommand};
use reqwest::Method;
use serde_json::json;

use crate::{client::Client, error::CliResult, output::print_json};

#[derive(Args, Debug)]
pub struct TeamCommands {
  #[command(subcommand)]
  command: TeamCommand,
}

#[derive(Subcommand, Debug)]
enum TeamCommand {
  List(ListArgs),
  Get(GetArgs),
  SelfTeam(SelfArgs),
  UpdateSelf(UpdateSelfArgs),
  Leave(SelfArgs),
  Query(QueryArgs),
  Create(CreateArgs),
  Join(JoinArgs),
  Rank(GetArgs),
  Members(GetArgs),
  Solves(GetArgs),
  Extra(GetArgs),
  CreateExtra(ExtraArgs),
  DeleteExtra(ExtraIdArgs),
  Update(UpdateTeamArgs),
  Delete(GetArgs),
}

#[derive(Args, Debug)]
struct ListArgs {
  #[arg(long)]
  game: i64,
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
  #[arg(long)]
  asc: Option<bool>,
  #[arg(long)]
  min_state: Option<String>,
}

#[derive(Args, Debug)]
struct GetArgs {
  #[arg(long)]
  game: i64,
  team: i64,
  #[arg(long)]
  ex: bool,
}

#[derive(Args, Debug)]
struct SelfArgs {
  game: i64,
}

#[derive(Args, Debug)]
struct UpdateSelfArgs {
  game: i64,
  #[arg(long)]
  name: String,
  #[arg(long)]
  tag: Option<String>,
  #[arg(long)]
  institute_id: Option<i64>,
}

#[derive(Args, Debug)]
struct QueryArgs {
  #[arg(long)]
  game: i64,
  token: String,
}

#[derive(Args, Debug)]
struct CreateArgs {
  #[arg(long)]
  game: i64,
  name: String,
  #[arg(long)]
  tag: Option<String>,
}

#[derive(Args, Debug)]
struct JoinArgs {
  #[arg(long)]
  game: i64,
  token: String,
}

#[derive(Args, Debug)]
struct ExtraArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  team: i64,
  #[arg(long)]
  reason: String,
  #[arg(long)]
  score: i32,
  #[arg(long)]
  hint_id: Option<i64>,
  #[arg(long)]
  challenge_id: Option<i64>,
}

#[derive(Args, Debug)]
struct ExtraIdArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  team: i64,
  id: i64,
}

#[derive(Args, Debug)]
struct UpdateTeamArgs {
  #[arg(long)]
  game: i64,
  team: i64,
  #[command(flatten)]
  body: crate::commands::common::JsonBodyArgs,
}

impl TeamCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    match self.command {
      TeamCommand::List(args) => {
        let value = client
          .get_typed::<(Vec<r2s_database::team::ExModel>, u64)>(
            &format!("/game/{}/team", args.game),
            &list_query(args),
          )
          .await?;
        print_json(value, json)
      }
      TeamCommand::Get(args) => {
        let query = if args.ex {
          vec![("ex", "true".to_owned())]
        } else {
          Vec::new()
        };
        let value = client
          .get_typed::<r2s_database::team::ExModel>(
            &format!("/game/{}/team/{}", args.game, args.team),
            &query,
          )
          .await?;
        print_json(value, json)
      }
      TeamCommand::SelfTeam(args) => print_json(
        client
          .get(&format!("/game/{}/team/self", args.game), &[])
          .await?,
        json,
      ),
      TeamCommand::UpdateSelf(args) => print_json(
        client
          .send_json(
            Method::PATCH,
            &format!("/game/{}/team/self", args.game),
            &[],
            Some(&json!({
              "name": args.name,
              "tag": args.tag,
              "institute_id": args.institute_id,
            })),
          )
          .await?,
        json,
      ),
      TeamCommand::Leave(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/team/self", args.game),
            &[],
            None,
          )
          .await?,
        json,
      ),
      TeamCommand::Query(args) => print_json(
        client
          .get(
            &format!("/game/{}/team/query", args.game),
            &[("token", args.token)],
          )
          .await?,
        json,
      ),
      TeamCommand::Create(args) => print_json(
        client
          .send_json(
            Method::POST,
            &format!("/game/{}/team", args.game),
            &[],
            Some(&json!({ "name": args.name, "tag": args.tag })),
          )
          .await?,
        json,
      ),
      TeamCommand::Join(args) => print_json(
        client
          .send_json(
            Method::PATCH,
            &format!("/game/{}/team", args.game),
            &[],
            Some(&json!({ "token": args.token })),
          )
          .await?,
        json,
      ),
      TeamCommand::Rank(args) => print_json(
        client
          .get(&format!("/game/{}/team/{}/rank", args.game, args.team), &[])
          .await?,
        json,
      ),
      TeamCommand::Members(args) => print_json(
        client
          .get(
            &format!("/game/{}/team/{}/member", args.game, args.team),
            &[],
          )
          .await?,
        json,
      ),
      TeamCommand::Solves(args) => print_json(
        client
          .get(
            &format!("/game/{}/team/{}/solve", args.game, args.team),
            &[],
          )
          .await?,
        json,
      ),
      TeamCommand::Extra(args) => print_json(
        client
          .get(
            &format!("/game/{}/team/{}/extra", args.game, args.team),
            &[],
          )
          .await?,
        json,
      ),
      TeamCommand::CreateExtra(args) => print_json(
        client
          .send_json(
            Method::POST,
            &format!("/game/{}/team/{}/extra", args.game, args.team),
            &[],
            Some(&json!({
              "reason": args.reason,
              "score": args.score,
              "hint_id": args.hint_id,
              "challenge_id": args.challenge_id,
            })),
          )
          .await?,
        json,
      ),
      TeamCommand::DeleteExtra(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/team/{}/extra", args.game, args.team),
            &[("id", args.id.to_string())],
            None,
          )
          .await?,
        json,
      ),
      TeamCommand::Update(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/team/{}", args.game, args.team),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      TeamCommand::Delete(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/team/{}", args.game, args.team),
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
  if let Some(order) = args.order {
    query.push(("order", order));
  }
  if let Some(filter) = args.filter {
    query.push(("filter", filter));
  }
  if let Some(institute_id) = args.institute_id {
    query.push(("institute_id", institute_id.to_string()));
  }
  if let Some(asc) = args.asc {
    query.push(("asc", asc.to_string()));
  }
  if let Some(min_state) = args.min_state {
    query.push(("min_state", min_state));
  }
  query
}

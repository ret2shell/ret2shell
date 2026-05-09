use clap::{Args, Subcommand};
use reqwest::Method;
use serde_json::json;

use crate::{client::Client, commands::common::JsonBodyArgs, error::CliResult, output::print_json};

#[derive(Args, Debug)]
pub struct GameCommands {
  #[command(subcommand)]
  command: GameCommand,
}

#[derive(Subcommand, Debug)]
enum GameCommand {
  List(ListArgs),
  Get(GetArgs),
  Create(BodyArgs),
  Update(UpdateArgs),
  Delete(DeleteArgs),
  Statistics(GetArgs),
  StatisticsExport(GetArgs),
  Administrators(GetArgs),
  UpdateAdministrators(UpdateArgs),
  Devices(GetArgs),
  Token(GetArgs),
  Solves(GetArgs),
  Instances(GetArgs),
  Doc(DocArgs),
  Introduction(GetArgs),
  Submissions(PageArgs),
  Audits(PageArgs),
  RegistryConfig(GetArgs),
  RegistryRefresh(GetArgs),
  RegistryRepo(GetArgs),
  RegistryImage(RegistryImageArgs),
  RegistryUpload(RegistryUploadArgs),
  Repo(RepoArgs),
  Notifications(GetArgs),
  CreateNotification(UpdateArgs),
  DeleteNotification(NotificationArgs),
  UpdateTraffic(UpdateArgs),
  DeleteTraffic(GetArgs),
  UpdateLifecycle(UpdateArgs),
  DeleteLifecycle(GetArgs),
  UpdateNodeSelector(UpdateArgs),
  DeleteNodeSelector(GetArgs),
  UpdateDoc(UpdateDocArgs),
  UpdateIntroduction(UpdateArgs),
  UpdateAudit(AuditArgs),
  ChatList(ChatListArgs),
  ChatSession(ChatSessionArgs),
  SendChat(SendChatArgs),
  PlayerChat(PlayerChatArgs),
  PlayerSendChat(PlayerSendChatArgs),
  UnreadChats(GetArgs),
}

#[derive(Args, Debug)]
struct ListArgs {
  #[arg(long)]
  page: Option<u64>,
  #[arg(long)]
  page_size: Option<u64>,
  #[arg(long)]
  host_type: Option<String>,
  #[arg(long)]
  weight: Option<i32>,
}

#[derive(Args, Debug)]
struct GetArgs {
  game: i64,
}

#[derive(Args, Debug)]
struct BodyArgs {
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct UpdateArgs {
  #[arg(long)]
  game: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct DeleteArgs {
  game: i64,
  #[arg(long)]
  force: bool,
}

#[derive(Args, Debug)]
struct DocArgs {
  #[arg(long)]
  game: i64,
  doc: String,
}

#[derive(Args, Debug)]
struct UpdateDocArgs {
  #[arg(long)]
  game: i64,
  doc: String,
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct NotificationArgs {
  #[arg(long)]
  game: i64,
  notification: i64,
}

#[derive(Args, Debug)]
struct AuditArgs {
  #[arg(long)]
  game: i64,
  audit: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct RegistryImageArgs {
  #[arg(long)]
  game: i64,
  image: String,
}

#[derive(Args, Debug)]
struct RegistryUploadArgs {
  #[arg(long)]
  game: i64,
  file: String,
}

#[derive(Args, Debug)]
struct RepoArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  path: Option<String>,
}

#[derive(Args, Debug)]
struct ChatListArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  page: Option<u64>,
  #[arg(long)]
  page_size: Option<u64>,
  #[arg(long)]
  challenge_id: Option<i64>,
}

#[derive(Args, Debug)]
struct ChatSessionArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  team_id: i64,
  #[arg(long)]
  challenge_id: i64,
}

#[derive(Args, Debug)]
struct SendChatArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  team_id: i64,
  #[arg(long)]
  challenge_id: i64,
  content: String,
}

#[derive(Args, Debug)]
struct PlayerChatArgs {
  #[arg(long)]
  game: i64,
  challenge: i64,
}

#[derive(Args, Debug)]
struct PlayerSendChatArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  challenge: i64,
  content: String,
}

#[derive(Args, Debug)]
struct PageArgs {
  #[arg(long)]
  game: i64,
  #[arg(long)]
  page: Option<u64>,
  #[arg(long)]
  page_size: Option<u64>,
}

impl GameCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    match self.command {
      GameCommand::List(args) => {
        let value = client
          .get_typed::<(Vec<r2s_database::game::Model>, u64)>("/game", &list_query(args))
          .await?;
        print_json(value, json)
      }
      GameCommand::Get(args) => {
        let value = client
          .get_typed::<r2s_database::game::Model>(&format!("/game/{}", args.game), &[])
          .await?;
        print_json(value, json)
      }
      GameCommand::Create(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(Method::POST, "/game", &[], Some(&body))
            .await?,
          json,
        )
      }
      GameCommand::Update(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}", args.game),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      GameCommand::Delete(args) => {
        let query = if args.force {
          vec![("force", "true".to_owned())]
        } else {
          Vec::new()
        };
        print_json(
          client
            .send_json(
              Method::DELETE,
              &format!("/game/{}", args.game),
              &query,
              None,
            )
            .await?,
          json,
        )
      }
      GameCommand::Statistics(args) => {
        let value = client
          .get(&format!("/game/{}/statistics", args.game), &[])
          .await?;
        print_json(value, json)
      }
      GameCommand::StatisticsExport(args) => print_json(
        client
          .get(&format!("/game/{}/statistics/export", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::Administrators(args) => print_json(
        client
          .get(&format!("/game/{}/administrator", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::UpdateAdministrators(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/administrator", args.game),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      GameCommand::Devices(args) => print_json(
        client
          .get(&format!("/game/{}/device", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::Token(args) => print_json(
        client
          .post(&format!("/game/{}/token", args.game), &())
          .await?,
        json,
      ),
      GameCommand::Solves(args) => print_json(
        client
          .get(&format!("/game/{}/solve", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::Instances(args) => print_json(
        client
          .get(&format!("/game/{}/instance", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::Doc(args) => print_json(
        client
          .get(&format!("/game/{}/doc/{}", args.game, args.doc), &[])
          .await?,
        json,
      ),
      GameCommand::Introduction(args) => print_json(
        client
          .get(&format!("/game/{}/introduction", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::Submissions(args) => {
        let query = page_query(&args);
        print_json(
          client
            .get(&format!("/game/{}/submission", args.game), &query)
            .await?,
          json,
        )
      }
      GameCommand::Audits(args) => {
        let query = page_query(&args);
        print_json(
          client
            .get(&format!("/game/{}/audit", args.game), &query)
            .await?,
          json,
        )
      }
      GameCommand::RegistryConfig(args) => print_json(
        client
          .get(&format!("/game/{}/registry/config", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::RegistryRefresh(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/registry/refresh", args.game),
            &[],
            None,
          )
          .await?,
        json,
      ),
      GameCommand::RegistryRepo(args) => print_json(
        client
          .get(&format!("/game/{}/registry", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::RegistryImage(args) => print_json(
        client
          .get(&format!("/game/{}/registry/{}", args.game, args.image), &[])
          .await?,
        json,
      ),
      GameCommand::RegistryUpload(args) => print_json(
        client
          .upload_file(&format!("/game/{}/registry", args.game), &[], &args.file)
          .await?,
        json,
      ),
      GameCommand::Repo(args) => {
        let query = args
          .path
          .map(|path| vec![("path", path)])
          .unwrap_or_default();
        print_json(
          client
            .get(&format!("/game/{}/repo", args.game), &query)
            .await?,
          json,
        )
      }
      GameCommand::Notifications(args) => print_json(
        client
          .get(&format!("/game/{}/notification", args.game), &[])
          .await?,
        json,
      ),
      GameCommand::CreateNotification(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::POST,
              &format!("/game/{}/notification", args.game),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      GameCommand::DeleteNotification(args) => print_json(
        client
          .send_json(
            Method::DELETE,
            &format!("/game/{}/notification/{}", args.game, args.notification),
            &[],
            None,
          )
          .await?,
        json,
      ),
      GameCommand::UpdateTraffic(args) => send_game_body(client, Method::PATCH, args, "traffic")
        .await
        .and_then(|value| print_json(value, json)),
      GameCommand::DeleteTraffic(args) => send_game_empty(client, Method::DELETE, args, "traffic")
        .await
        .and_then(|value| print_json(value, json)),
      GameCommand::UpdateLifecycle(args) => {
        send_game_body(client, Method::PATCH, args, "lifecycle")
          .await
          .and_then(|value| print_json(value, json))
      }
      GameCommand::DeleteLifecycle(args) => {
        send_game_empty(client, Method::DELETE, args, "lifecycle")
          .await
          .and_then(|value| print_json(value, json))
      }
      GameCommand::UpdateNodeSelector(args) => {
        send_game_body(client, Method::PATCH, args, "node-selector")
          .await
          .and_then(|value| print_json(value, json))
      }
      GameCommand::DeleteNodeSelector(args) => {
        send_game_empty(client, Method::DELETE, args, "node-selector")
          .await
          .and_then(|value| print_json(value, json))
      }
      GameCommand::UpdateDoc(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/doc/{}", args.game, args.doc),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      GameCommand::UpdateIntroduction(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/introduction", args.game),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      GameCommand::UpdateAudit(args) => {
        let body = args.body.required()?;
        print_json(
          client
            .send_json(
              Method::PATCH,
              &format!("/game/{}/audit/{}", args.game, args.audit),
              &[],
              Some(&body),
            )
            .await?,
          json,
        )
      }
      GameCommand::ChatList(args) => {
        let mut query = page_query(&PageArgs {
          game: args.game,
          page: args.page,
          page_size: args.page_size,
        });
        if let Some(challenge_id) = args.challenge_id {
          query.push(("challenge_id", challenge_id.to_string()));
        }
        print_json(
          client
            .get(&format!("/game/{}/chat/admin", args.game), &query)
            .await?,
          json,
        )
      }
      GameCommand::ChatSession(args) => {
        let query = vec![
          ("team_id", args.team_id.to_string()),
          ("challenge_id", args.challenge_id.to_string()),
        ];
        print_json(
          client
            .get(&format!("/game/{}/chat/admin/session", args.game), &query)
            .await?,
          json,
        )
      }
      GameCommand::SendChat(args) => {
        let query = vec![
          ("team_id", args.team_id.to_string()),
          ("challenge_id", args.challenge_id.to_string()),
        ];
        print_json(
          client
            .send_json(
              Method::POST,
              &format!("/game/{}/chat/admin/session", args.game),
              &query,
              Some(&json!({ "content": args.content })),
            )
            .await?,
          json,
        )
      }
      GameCommand::PlayerChat(args) => print_json(
        client
          .get(&format!("/game/{}/chat/{}", args.game, args.challenge), &[])
          .await?,
        json,
      ),
      GameCommand::PlayerSendChat(args) => print_json(
        client
          .send_json(
            Method::POST,
            &format!("/game/{}/chat/{}", args.game, args.challenge),
            &[],
            Some(&json!({ "content": args.content })),
          )
          .await?,
        json,
      ),
      GameCommand::UnreadChats(args) => print_json(
        client
          .get(&format!("/game/{}/chat/unread", args.game), &[])
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
  if let Some(host_type) = args.host_type {
    query.push(("host_type", host_type));
  }
  if let Some(weight) = args.weight {
    query.push(("weight", weight.to_string()));
  }
  query
}

async fn send_game_body(
  client: &Client, method: Method, args: UpdateArgs, path: &str,
) -> CliResult<serde_json::Value> {
  let body = args.body.required()?;
  client
    .send_json(
      method,
      &format!("/game/{}/{}", args.game, path),
      &[],
      Some(&body),
    )
    .await
}

async fn send_game_empty(
  client: &Client, method: Method, args: GetArgs, path: &str,
) -> CliResult<serde_json::Value> {
  client
    .send_json(method, &format!("/game/{}/{}", args.game, path), &[], None)
    .await
}

fn page_query(args: &PageArgs) -> Vec<(&'static str, String)> {
  let mut query = Vec::new();
  if let Some(page) = args.page {
    query.push(("page", page.to_string()));
  }
  if let Some(page_size) = args.page_size {
    query.push(("page_size", page_size.to_string()));
  }
  query
}

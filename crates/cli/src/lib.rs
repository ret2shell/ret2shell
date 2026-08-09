mod auth;
mod client;
mod commands;
pub mod config;
mod error;
mod output;

use std::env;

use clap::{Parser, Subcommand};
pub use error::{CliError, CliResult};

use crate::{
  client::{Auth, Client},
  commands::{
    account::AccountCommands,
    api::ApiCommands,
    article::{BulletinCommands, WikiCommands},
    auth::AuthCommands,
    calendar::CalendarCommands,
    challenge::ChallengeCommands,
    cluster::ClusterCommands,
    game::GameCommands,
    media::MediaCommands,
    ping::PingCommand,
    platform::PlatformCommands,
    rpc::RpcCommands,
    submission::SubmissionCommands,
    team::TeamCommands,
    user::UserCommands,
  },
  config::ClientConfig,
};

#[derive(Parser, Debug)]
#[command(
  author = "ZacharyZcR <ZacharyZcR1984@gmail.com>",
  version,
  about = "Ret2Shell command line client"
)]
pub struct Cli {
  #[arg(long)]
  pub base_url: Option<String>,

  #[arg(long)]
  pub token: Option<String>,

  #[arg(long, global = true)]
  pub json: bool,

  #[command(subcommand)]
  pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
  Account(AccountCommands),
  Api(ApiCommands),
  Auth(AuthCommands),
  Bulletin(BulletinCommands),
  Calendar(CalendarCommands),
  Cluster(ClusterCommands),
  Media(MediaCommands),
  Ping(PingCommand),
  Platform(PlatformCommands),
  Rpc(RpcCommands),
  Game(GameCommands),
  Challenge(ChallengeCommands),
  Team(TeamCommands),
  Submission(SubmissionCommands),
  User(UserCommands),
  Wiki(WikiCommands),
}

pub async fn run(cli: Cli) -> CliResult<()> {
  let config = ClientConfig::load().unwrap_or_default();

  let base_url = cli
    .base_url
    .or_else(|| env::var("R2S_BASE_URL").ok())
    .or(config.base_url)
    .unwrap_or_else(|| "http://127.0.0.1:8080/api".to_owned());

  let token = cli
    .token
    .or_else(|| env::var("R2S_TOKEN").ok())
    .or(config.token);

  let auth = match token {
    Some(t) => Auth::Bearer(t),
    None => Auth::None,
  };

  let client = Client::new(base_url, auth)?;
  match cli.command {
    Commands::Account(command) => command.run(&client, cli.json).await,
    Commands::Api(command) => command.run(&client, cli.json).await,
    Commands::Auth(command) => command.run(&client, cli.json).await,
    Commands::Bulletin(command) => command.run(&client, cli.json).await,
    Commands::Calendar(command) => command.run(&client, cli.json).await,
    Commands::Cluster(command) => command.run(&client, cli.json).await,
    Commands::Media(command) => command.run(&client, cli.json).await,
    Commands::Ping(command) => command.run(&client, cli.json).await,
    Commands::Platform(command) => command.run(&client, cli.json).await,
    Commands::Rpc(command) => command.run(&client, cli.json).await,
    Commands::Game(command) => command.run(&client, cli.json).await,
    Commands::Challenge(command) => command.run(&client, cli.json).await,
    Commands::Team(command) => command.run(&client, cli.json).await,
    Commands::Submission(command) => command.run(&client, cli.json).await,
    Commands::User(command) => command.run(&client, cli.json).await,
    Commands::Wiki(command) => command.run(&client, cli.json).await,
  }
}

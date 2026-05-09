use std::env;

use clap::{Args, Subcommand};

use crate::{
  client::Client,
  error::{CliError, CliResult},
  output::print_value,
};

#[derive(Args, Debug)]
pub struct AuthCommands {
  #[command(subcommand)]
  command: AuthCommand,
}

#[derive(Subcommand, Debug)]
enum AuthCommand {
  Login(LoginArgs),
}

#[derive(Args, Debug)]
struct LoginArgs {
  #[arg(long)]
  account: Option<String>,
  #[arg(long)]
  password: Option<String>,
  #[arg(long, default_value = "")]
  captcha_id: String,
  #[arg(long, default_value = "")]
  captcha_answer: String,
}

impl AuthCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    match self.command {
      AuthCommand::Login(args) => {
        let account = args
          .account
          .or_else(|| env::var("R2S_ACCOUNT").ok())
          .ok_or_else(|| CliError::Config("missing account".to_owned()))?;
        let password = args
          .password
          .or_else(|| env::var("R2S_PASSWORD").ok())
          .ok_or_else(|| CliError::Config("missing password".to_owned()))?;
        let value = client
          .login(account, password, args.captcha_id, args.captcha_answer)
          .await?;
        print_value(value, json)
      }
    }
  }
}

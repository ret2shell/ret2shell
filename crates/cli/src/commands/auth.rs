use std::env;

use clap::{Args, Subcommand};
use ring::digest::{Context, SHA256};

use crate::{
  client::Client,
  config::ClientConfig,
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
  Token(TokenArgs),
  Status,
  Logout,
}

#[derive(Args, Debug)]
struct LoginArgs {
  #[arg(long)]
  account: Option<String>,
  #[arg(long)]
  password: Option<String>,
}

#[derive(Args, Debug)]
struct TokenArgs {
  token: String,
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

        let captcha: serde_json::Value = client.get("/account/captcha/cli", &[]).await?;
        let challenge = captcha["challenge"]
          .as_str()
          .ok_or_else(|| CliError::Config("missing captcha challenge".to_owned()))?;
        let captcha_id = captcha["id"]
          .as_str()
          .ok_or_else(|| CliError::Config("missing captcha id".to_owned()))?;

        let (difficulty, seed) = challenge
          .split_once('#')
          .ok_or_else(|| CliError::Config("invalid challenge format".to_owned()))?;
        let difficulty: usize = difficulty
          .parse()
          .map_err(|_| CliError::Config("invalid difficulty".to_owned()))?;
        let prefix = "0".repeat(difficulty);

        let answer = (0u64..)
          .map(|nonce| format!("{seed}-{nonce}"))
          .find(|candidate| sha256_hex(candidate).starts_with(&prefix))
          .unwrap();

        let value = client
          .login(account, password, captcha_id.to_owned(), answer)
          .await?;

        if let Some(token) = value["token"].as_str() {
          let mut config = ClientConfig::load()?;
          config.token = Some(token.to_owned());
          config.base_url = Some(client.base_url().to_owned());
          config.save()?;
        }

        print_value(value, json)
      }
      AuthCommand::Token(args) => {
        let mut config = ClientConfig::load()?;
        config.token = Some(args.token);
        if config.base_url.is_none() {
          config.base_url = Some(client.base_url().to_owned());
        }
        config.save()?;
        print_value(serde_json::json!({"status": "token saved"}), json)
      }
      AuthCommand::Status => {
        let config = ClientConfig::load()?;
        let value = serde_json::json!({
          "base_url": config.base_url,
          "authenticated": config.token.is_some(),
        });
        print_value(value, json)
      }
      AuthCommand::Logout => {
        let mut config = ClientConfig::load()?;
        config.token = None;
        config.save()?;
        print_value(serde_json::json!({"status": "logged out"}), json)
      }
    }
  }
}

fn sha256_hex(input: &str) -> String {
  let mut ctx = Context::new(&SHA256);
  ctx.update(input.as_bytes());
  hex::encode(ctx.finish().as_ref())
}

use clap::{Args, Subcommand};
use reqwest::Method;
use serde_json::json;

use crate::{
  client::Client,
  commands::common::{JsonBodyArgs, parse_query, query_refs},
  error::CliResult,
  output::print_value,
};

#[derive(Args, Debug)]
pub struct AccountCommands {
  #[command(subcommand)]
  command: AccountCommand,
}

#[derive(Subcommand, Debug)]
enum AccountCommand {
  Profile,
  Code,
  GenerateCode,
  Captcha,
  CliCaptcha,
  QueryCode(QueryCodeArgs),
  Institutes,
  Institute(InstituteArgs),
  CreateInstitute(BodyArgs),
  UpdateInstitute(UpdateInstituteArgs),
  DeleteInstitute(InstituteArgs),
  #[command(name = "oauth-providers")]
  OAuthProviders,
  #[command(name = "oauth-provider")]
  OAuthProvider(ServiceArgs),
  #[command(name = "create-oauth-provider")]
  CreateOAuthProvider(BodyArgs),
  #[command(name = "update-oauth-provider")]
  UpdateOAuthProvider(UpdateOAuthProviderArgs),
  #[command(name = "delete-oauth-provider")]
  DeleteOAuthProvider(ServiceArgs),
  #[command(name = "oauth-status")]
  OAuthStatus,
  #[command(name = "bind-oauth")]
  BindOAuth(BindOAuthArgs),
  #[command(name = "unbind-oauth")]
  UnbindOAuth(UnbindOAuthArgs),
  CheckCaptcha(CheckCaptchaArgs),
  Logout,
}

#[derive(Args, Debug)]
struct QueryCodeArgs {
  code: u64,
}

#[derive(Args, Debug)]
struct InstituteArgs {
  institute: i64,
}

#[derive(Args, Debug)]
struct BodyArgs {
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct UpdateInstituteArgs {
  institute: i64,
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct ServiceArgs {
  service: String,
}

#[derive(Args, Debug)]
struct UpdateOAuthProviderArgs {
  service: String,
  #[command(flatten)]
  body: JsonBodyArgs,
}

#[derive(Args, Debug)]
struct BindOAuthArgs {
  service: String,
  #[arg(short, long = "query")]
  query: Vec<String>,
}

#[derive(Args, Debug)]
struct UnbindOAuthArgs {
  id: i64,
}

#[derive(Args, Debug)]
struct CheckCaptchaArgs {
  id: String,
  answer: String,
}

impl AccountCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      AccountCommand::Profile => client.get("/account/profile", &[]).await?,
      AccountCommand::Code => client.get("/account/code", &[]).await?,
      AccountCommand::GenerateCode => client.post("/account/code", &()).await?,
      AccountCommand::Captcha => client.get("/account/captcha", &[]).await?,
      AccountCommand::CliCaptcha => client.get("/account/captcha/cli", &[]).await?,
      AccountCommand::QueryCode(args) => {
        client
          .get("/account/query", &[("code", args.code.to_string())])
          .await?
      }
      AccountCommand::Institutes => client.get("/account/institute", &[]).await?,
      AccountCommand::Institute(args) => {
        client
          .get(&format!("/account/institute/{}", args.institute), &[])
          .await?
      }
      AccountCommand::CreateInstitute(args) => {
        let body = args.body.required()?;
        client
          .send_json(Method::POST, "/account/institute", &[], Some(&body))
          .await?
      }
      AccountCommand::UpdateInstitute(args) => {
        let body = args.body.required()?;
        client
          .send_json(
            Method::PATCH,
            &format!("/account/institute/{}", args.institute),
            &[],
            Some(&body),
          )
          .await?
      }
      AccountCommand::DeleteInstitute(args) => {
        client
          .send_json(
            Method::DELETE,
            &format!("/account/institute/{}", args.institute),
            &[],
            None,
          )
          .await?
      }
      AccountCommand::OAuthProviders => client.get("/account/oauth/provider", &[]).await?,
      AccountCommand::OAuthProvider(args) => {
        client
          .get(&format!("/account/oauth/provider/{}", args.service), &[])
          .await?
      }
      AccountCommand::CreateOAuthProvider(args) => {
        let body = args.body.required()?;
        client
          .send_json(Method::POST, "/account/oauth/provider", &[], Some(&body))
          .await?
      }
      AccountCommand::UpdateOAuthProvider(args) => {
        let body = args.body.required()?;
        client
          .send_json(
            Method::PATCH,
            &format!("/account/oauth/provider/{}", args.service),
            &[],
            Some(&body),
          )
          .await?
      }
      AccountCommand::DeleteOAuthProvider(args) => {
        client
          .send_json(
            Method::DELETE,
            &format!("/account/oauth/provider/{}", args.service),
            &[],
            None,
          )
          .await?
      }
      AccountCommand::OAuthStatus => client.get("/account/oauth/bind", &[]).await?,
      AccountCommand::BindOAuth(args) => {
        let mut query = parse_query(args.query)?;
        query.insert(0, ("service".to_owned(), args.service));
        let query = query_refs(&query);
        client
          .send_json(Method::POST, "/account/oauth/bind", &query, None)
          .await?
      }
      AccountCommand::UnbindOAuth(args) => {
        client
          .send_json(
            Method::DELETE,
            "/account/oauth/bind",
            &[("id", args.id.to_string())],
            None,
          )
          .await?
      }
      AccountCommand::CheckCaptcha(args) => {
        client
          .send_json(
            Method::POST,
            "/account/captcha",
            &[],
            Some(&json!({ "id": args.id, "answer": args.answer })),
          )
          .await?
      }
      AccountCommand::Logout => client.post("/account/logout", &()).await?,
    };
    print_value(value, json)
  }
}

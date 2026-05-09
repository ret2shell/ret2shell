use clap::{Args, Subcommand};

use crate::{client::Client, error::CliResult, output::print_json};

#[derive(Args, Debug)]
pub struct RpcCommands {
  #[command(subcommand)]
  command: RpcCommand,
}

#[derive(Subcommand, Debug)]
enum RpcCommand {
  Deunicode(StringArgs),
  Leet(StringArgs),
}

#[derive(Args, Debug)]
struct StringArgs {
  text: String,
  #[arg(long)]
  keep_case: bool,
}

impl RpcCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let (path, args) = match self.command {
      RpcCommand::Deunicode(args) => ("/rpc/string/deunicode", args),
      RpcCommand::Leet(args) => ("/rpc/string/leet", args),
    };
    let value = client
      .get(
        path,
        &[
          ("text", args.text),
          ("keep_case", args.keep_case.to_string()),
        ],
      )
      .await?;
    print_json(value, json)
  }
}

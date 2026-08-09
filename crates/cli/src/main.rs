use std::process::exit;

use clap::Parser;
use r2s_cli::{Cli, run};

#[tokio::main]
async fn main() {
  let cli = Cli::parse();
  let json = cli.json;
  if let Err(err) = run(cli).await {
    if json {
      eprintln!("{}", err.as_json());
    } else {
      eprintln!("{err}");
    }
    exit(err.exit_code());
  }
}

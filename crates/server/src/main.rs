use std::{path::PathBuf, process::exit};

use clap::{Parser, Subcommand, ValueEnum};
use owo_colors::OwoColorize;
use r2s_config::GlobalConfig;
use r2s_server::{R2S_VERSION, down, greet, run_post_receive, up};

/// Clap arg definition.
#[derive(Parser, Debug)]
#[command(
  author = "Reverier-Xu <reverier.xu@woooo.tech>",
  version,
  about = "Ret 2 Shell Challenge API Platform",
  long_about = r#"
Ret 2 Shell Challenge API Platform

THE CONTENTS OF THIS PROJECT ARE PROPRIETARY AND CONFIDENTIAL.
UNAUTHORIZED COPYING, TRANSFERRING OR REPRODUCTION OF THE CONTENTS OF THIS PROJECT,
VIA ANY MEDIUM IS STRICTLY PROHIBITED.

If you have any problems, please contact tech support <support@ret.sh.cn>.
    "#
)]
struct CliArgs {
  #[command(subcommand)]
  command: Option<Commands>,
}

/// Clap subcommands.
#[derive(Subcommand, Debug)]
enum Commands {
  /// Run the server.
  Up,
  /// Remove all data and drop database, NEVER USE IT AT PRODUCTION
  /// ENVIRONMENT.
  Down,
  /// Internal utilities.
  Internal(InternalArgs),
}

#[derive(clap::Args, Debug)]
struct InternalArgs {
  #[command(subcommand)]
  command: InternalCommands,
}

#[derive(Subcommand, Debug)]
enum InternalCommands {
  /// Run an internal git hook forwarder.
  Hook(HookArgs),
}

#[derive(clap::Args, Debug)]
struct HookArgs {
  #[arg(value_enum)]
  kind: HookKind,
  #[arg(long)]
  session: String,
  #[arg(long)]
  auth_key: String,
  #[arg(long)]
  base_url: String,
  #[arg(long)]
  repo_path: PathBuf,
}

#[derive(Clone, Debug, ValueEnum)]
enum HookKind {
  PostReceive,
}

/// Server entry.
#[tokio::main]
async fn main() {
  let command = match CliArgs::parse().command {
    Some(Commands::Internal(internal)) => {
      if let Err(err) = run_internal(internal).await {
        eprintln!("{} internal hook failed: {err}", "[ERROR]".red().bold());
        exit(1);
      }
      return;
    }
    other => other,
  };

  let config = match GlobalConfig::load() {
    Ok(config) => config,
    Err(e) => {
      eprintln!(
        "{}",
        "Ret 2 Shell Challenge API Platform failed to init!"
          .red()
          .bold()
      );
      eprintln!("Version: {R2S_VERSION}");
      eprintln!("{}: {e}", "Failed to load server config".red().bold());
      eprintln!("Please check your configuration file and try again.");
      eprintln!(
        "If you are still suffering from this problem and don't know how to fix it, please contact tech support <support@ret.sh.cn>."
      );
      exit(1)
    }
  };
  greet();
  match match command {
    Some(Commands::Up) => up(config).await,
    Some(Commands::Down) => down(config).await,
    Some(Commands::Internal(_)) => Ok(()),
    None => up(config).await,
  } {
    Ok(_) => {}
    Err(e) => {
      eprintln!(
        "{}",
        "Ret 2 Shell Challenge API Platform failed to start!"
          .red()
          .bold()
      );
      eprintln!("Version: {R2S_VERSION}");
      eprintln!("{}: {e}", "Failed to start server".red().bold());
      eprintln!("Please check your configuration file and try again.");
      eprintln!(
        "If you are still suffering from this problem and don't know how to fix it, please contact tech support <support@ret.sh.cn>."
      );
      exit(1)
    }
  }
}

async fn run_internal(args: InternalArgs) -> anyhow::Result<()> {
  match args.command {
    InternalCommands::Hook(hook) => match hook.kind {
      HookKind::PostReceive => {
        run_post_receive(
          &hook.session,
          &hook.auth_key,
          &hook.base_url,
          &hook.repo_path,
        )
        .await
      }
    },
  }
}

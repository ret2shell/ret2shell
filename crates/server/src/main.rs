use std::process::exit;

use clap::{Parser, Subcommand};
use colored::Colorize;
use r2s_config::GlobalConfig;
use r2s_server::{down, greet, up};

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

If you have any problems, please contact tech support <ret2shell@woooo.tech>.
    "#
)]
struct Args {
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
}

/// Server entry.
#[tokio::main]
async fn main() {
    let config = match GlobalConfig::load() {
        Ok(config) => config,
        Err(e) => {
            eprintln!("{}: {e}", "Failed to load server config".red().bold());
            eprintln!("Please check your configuration file and try again.");
            eprintln!("If you are still suffering from this problem and don't know how to fix it, please contact tech support <ret2shell@woooo.tech>.");
            exit(1)
        }
    };
    greet();
    // Parse command line arguments
    let args: Args = Args::parse();
    match match args.command {
        Some(Commands::Up) => up(config).await,
        Some(Commands::Down) => down(config).await,
        None => up(config).await,
    } {
        Ok(_) => {}
        Err(e) => {
            eprintln!("{}: {e}", "Failed to start server".red().bold());
            eprintln!("Please check your configuration file and try again.");
            eprintln!("If you are still suffering from this problem and don't know how to fix it, please contact tech support <ret2shell@woooo.tech>.");
            exit(1)
        }
    }
}

use clap::{Args, Subcommand};

use crate::{client::Client, error::CliResult, output::print_value};

#[derive(Args, Debug)]
pub struct MediaCommands {
  #[command(subcommand)]
  command: MediaCommand,
}

#[derive(Subcommand, Debug)]
enum MediaCommand {
  Download(DownloadArgs),
  Upload(UploadArgs),
}

#[derive(Args, Debug)]
struct DownloadArgs {
  hash: String,
  #[arg(short, long)]
  output: String,
}

#[derive(Args, Debug)]
struct UploadArgs {
  file: String,
  #[arg(long)]
  thumbnail: bool,
}

impl MediaCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      MediaCommand::Download(args) => {
        client
          .download("/media", &[("hash", args.hash)], &args.output)
          .await?
      }
      MediaCommand::Upload(args) => {
        let query = if args.thumbnail {
          vec![("thumbnail", "true".to_owned())]
        } else {
          Vec::new()
        };
        client.upload_file("/media", &query, &args.file).await?
      }
    };
    print_value(value, json)
  }
}

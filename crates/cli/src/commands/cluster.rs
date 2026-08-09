use clap::{Args, Subcommand};
use reqwest::Method;

use crate::{
  client::Client, commands::common::JsonBodyArgs, error::CliResult, output::print_value,
};

#[derive(Args, Debug)]
pub struct ClusterCommands {
  #[command(subcommand)]
  command: ClusterCommand,
}

#[derive(Subcommand, Debug)]
enum ClusterCommand {
  Config,
  Nodes,
  Calmdown,
  UpdateNodeSelector(BodyArgs),
  DeleteNodeSelector,
  UpdateTraffic(BodyArgs),
  DeleteTraffic,
  UpdateLifecycle(BodyArgs),
  DeleteLifecycle,
}

#[derive(Args, Debug)]
struct BodyArgs {
  #[command(flatten)]
  body: JsonBodyArgs,
}

impl ClusterCommands {
  pub async fn run(self, client: &Client, json: bool) -> CliResult<()> {
    let value = match self.command {
      ClusterCommand::Config => client.get("/cluster/config", &[]).await?,
      ClusterCommand::Nodes => client.get("/cluster/node", &[]).await?,
      ClusterCommand::Calmdown => client.get("/cluster/calmdown", &[]).await?,
      ClusterCommand::UpdateNodeSelector(args) => {
        let body = args.body.required()?;
        client
          .send_json(Method::PATCH, "/cluster/node-selector", &[], Some(&body))
          .await?
      }
      ClusterCommand::DeleteNodeSelector => {
        client
          .send_json(Method::DELETE, "/cluster/node-selector", &[], None)
          .await?
      }
      ClusterCommand::UpdateTraffic(args) => {
        let body = args.body.required()?;
        client
          .send_json(Method::PATCH, "/cluster/traffic", &[], Some(&body))
          .await?
      }
      ClusterCommand::DeleteTraffic => {
        client
          .send_json(Method::DELETE, "/cluster/traffic", &[], None)
          .await?
      }
      ClusterCommand::UpdateLifecycle(args) => {
        let body = args.body.required()?;
        client
          .send_json(Method::PATCH, "/cluster/lifecycle", &[], Some(&body))
          .await?
      }
      ClusterCommand::DeleteLifecycle => {
        client
          .send_json(Method::DELETE, "/cluster/lifecycle", &[], None)
          .await?
      }
    };
    print_value(value, json)
  }
}

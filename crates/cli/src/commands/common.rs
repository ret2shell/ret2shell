use std::fs;

use clap::Args;
use serde_json::Value;

use crate::{
  error::{CliError, CliResult},
  output::print_json,
};

pub fn parse_query(items: Vec<String>) -> CliResult<Vec<(String, String)>> {
  items
    .into_iter()
    .map(|item| {
      let (key, value) = item
        .split_once('=')
        .ok_or_else(|| CliError::Config(format!("invalid query pair: {item}")))?;
      if key.is_empty() {
        return Err(CliError::Config("query key can not be empty".to_owned()));
      }
      Ok((key.to_owned(), value.to_owned()))
    })
    .collect()
}

pub fn query_refs(query: &[(String, String)]) -> Vec<(&str, String)> {
  query
    .iter()
    .map(|(key, value)| (key.as_str(), value.clone()))
    .collect()
}

pub fn optional_json(value: Option<String>, file: Option<String>) -> CliResult<Option<Value>> {
  match (value, file) {
    (Some(_), Some(_)) => Err(CliError::Config(
      "use either --body or --body-file, not both".to_owned(),
    )),
    (Some(value), None) => Ok(Some(serde_json::from_str(&value)?)),
    (None, Some(file)) => Ok(Some(serde_json::from_str(&fs::read_to_string(file)?)?)),
    (None, None) => Ok(None),
  }
}

#[derive(Args, Clone, Debug)]
pub struct JsonBodyArgs {
  #[arg(long)]
  pub body: Option<String>,
  #[arg(long)]
  pub body_file: Option<String>,
}

impl JsonBodyArgs {
  pub fn required(self) -> CliResult<Value> {
    optional_json(self.body, self.body_file)?
      .ok_or_else(|| CliError::Config("missing --body or --body-file".to_owned()))
  }
}

pub fn print(value: Value, json: bool) -> CliResult<()> {
  print_json(value, json)
}

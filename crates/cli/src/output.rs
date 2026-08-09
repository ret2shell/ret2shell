use serde::Serialize;
use serde_json::Value;

use crate::error::CliResult;

pub fn print_value(value: Value, json: bool) -> CliResult<()> {
  print_json(value, json)
}

pub fn print_json<T: Serialize>(value: T, json: bool) -> CliResult<()> {
  if json {
    println!("{}", serde_json::to_string(&value)?);
  } else {
    println!("{}", serde_json::to_string_pretty(&value)?);
  }
  Ok(())
}

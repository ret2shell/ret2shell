use std::collections::BTreeSet;

use aho_corasick::AhoCorasick;
use thiserror::Error;
use tokio::{
  fs::File,
  io::{AsyncBufReadExt, BufReader},
};
use tracing::debug;

#[derive(Error, Debug)]
pub enum WordFilterError {
  #[error("io error: {0}")]
  IOError(#[from] std::io::Error),
  #[error("failed to build aho-corasick automaton: {0}")]
  AhoCorasickError(#[from] aho_corasick::BuildError),
}

/// Reads a file containing sensitive words and returns a `BTreeSet` of those
/// words.
pub async fn read_sensitive_word_file(path: &str) -> Result<BTreeSet<String>, WordFilterError> {
  let mut set = BTreeSet::<String>::new();
  let f = File::open(path).await?;
  let reader = BufReader::new(f);
  let mut lines = reader.lines();
  while let Some(next_line) = lines.next_line().await? {
    set.insert(next_line);
  }
  Ok(set)
}

/// Initializes the Aho-Corasick automaton for sensitive word filtering.
pub async fn initialize(
  sensitive_word_list: &Option<String>,
) -> Result<Option<AhoCorasick>, WordFilterError> {
  debug!(
    file = ?sensitive_word_list,
    "initializing word filter",
  );
  if let Some(sensitive_word_list) = sensitive_word_list {
    let sensitive_words = read_sensitive_word_file(sensitive_word_list).await?;
    let ac = AhoCorasick::new(sensitive_words)?;
    Ok(Some(ac))
  } else {
    Ok(None)
  }
}

/// Checks if a given text contains any sensitive words using the Aho-Corasick
/// automaton.
pub fn check_text(ac: &AhoCorasick, src: &str) -> bool {
  let result = ac
    .find(
      &src
        .trim()
        .lines()
        .map(|part| {
          part
            .trim()
            .split_inclusive(char::is_whitespace)
            .filter(|part| !part.trim().is_empty())
            .collect::<String>()
        })
        .collect::<String>(),
    )
    .is_some();
  debug!(?src, ?result, "checking sensitive words");
  result
}

#[cfg(test)]
mod tests {
  use std::time::{SystemTime, UNIX_EPOCH};

  use super::{check_text, initialize, read_sensitive_word_file};

  async fn temp_word_file(lines: &[&str]) -> String {
    let path = std::env::temp_dir().join(format!(
      "r2s-auditor-test-{}-{}",
      std::process::id(),
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    tokio::fs::write(&path, lines.join("\n")).await.unwrap();
    path.to_string_lossy().to_string()
  }

  #[tokio::test]
  async fn read_sensitive_word_file_deduplicates_lines() {
    let path = temp_word_file(&["flag", "admin", "admin", "root"]).await;

    let words = read_sensitive_word_file(&path).await.unwrap();

    let words: Vec<String> = words.into_iter().collect();
    assert_eq!(words, vec!["admin", "flag", "root"]);
    tokio::fs::remove_file(path).await.ok();
  }

  #[tokio::test]
  async fn initialize_builds_filter_from_file_and_none_without_config() {
    assert!(initialize(&None).await.unwrap().is_none());

    let path = temp_word_file(&["sensitive"]).await;
    let ac = initialize(&Some(path.clone())).await.unwrap().unwrap();

    assert!(check_text(&ac, "this is a sensitive message"));
    assert!(!check_text(&ac, "nothing special here"));
    tokio::fs::remove_file(path).await.ok();
  }

  #[tokio::test]
  async fn read_missing_word_file_fails_with_io_error() {
    let result = read_sensitive_word_file("/nonexistent/words.txt").await;
    assert!(matches!(result, Err(super::WordFilterError::IOError(_))));
  }

  #[test]
  fn test_aho_corasick_cjk() {
    use aho_corasick::AhoCorasick;
    let ac = AhoCorasick::new(vec!["你好", "你们", "世界", "世家"])
      .expect("failed to create Aho-Corasick automaton");
    let matches = ac.find_iter("对这个世界说声你好");
    let mut matches_vec = Vec::new();
    for m in matches {
      matches_vec.push(m);
    }
    println!("{matches_vec:?}");
  }

  #[test]
  fn test_check_text() {
    use aho_corasick::AhoCorasick;
    let ac = AhoCorasick::new(vec!["你好", "你们", "世界", "世家"])
      .expect("Failed to create Aho-Corasick automaton");
    assert!(check_text(&ac, "对这个世 界说声你\n好"));
  }
}

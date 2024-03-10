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
        "initializing word filter with file: {:?}",
        sensitive_word_list
    );
    if let Some(sensitive_word_list) = sensitive_word_list {
        let sensitive_words = read_sensitive_word_file(&sensitive_word_list).await?;
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
            &src.trim()
                .lines()
                .map(|part| {
                    part.trim()
                        .split_inclusive(char::is_whitespace)
                        .filter(|part| !part.trim().is_empty())
                        .collect::<String>()
                })
                .collect::<String>(),
        )
        .is_some();
    debug!("checking text: {}, result: {}", src, result);
    result
}

#[cfg(test)]
mod tests {
    use super::check_text;

    #[test]
    fn test_aho_corasick_cjk() {
        use aho_corasick::AhoCorasick;
        let ac = AhoCorasick::new(vec!["你好", "你们", "世界", "世家"])
            .expect("Failed to create Aho-Corasick automaton");
        let matches = ac.find_iter("对这个世界说声你好");
        let mut matches_vec = Vec::new();
        for m in matches {
            matches_vec.push(m);
        }
        println!("{:?}", matches_vec);
    }

    #[test]
    fn test_check_text() {
        use aho_corasick::AhoCorasick;
        let ac = AhoCorasick::new(vec!["你好", "你们", "世界", "世家"])
            .expect("Failed to create Aho-Corasick automaton");
        assert!(check_text(&ac, "对这个世 界说声你\n好"));
    }
}

use aho_corasick::AhoCorasick;
use r2s_config::auditor;
use thiserror::Error;

pub mod filter;
pub mod monitor;
pub mod traits;

/// Auditor is a struct that contains some components to audit sensitive
/// information.
#[derive(Clone, Debug)]
pub struct Auditor {
  pub filter: Option<AhoCorasick>,
}

impl Auditor {
  /// check if the content contains sensitive words, return true when
  /// sensitive contents detected.
  pub fn audit_content(&self, src: &str) -> bool {
    if let Some(ref ac) = self.filter {
      filter::check_text(ac, src)
    } else {
      false
    }
  }
}

#[derive(Error, Debug)]
pub enum AuditorError {
  #[error("word filter error: {0}")]
  WordFilterError(#[from] filter::WordFilterError),
}

/// Initializes the auditor with a list of sensitive words.
///
/// * `sensitive_word_list` - The path to a file containing sensitive words.
///
/// Returns a new `Auditor` instance.
pub async fn initialize(config: &Option<auditor::Config>) -> Result<Auditor, AuditorError> {
  let config = config.clone().unwrap_or(auditor::Config {
    sensitive_word_list: None,
  });
  let word_filter = filter::initialize(&config.sensitive_word_list).await?;
  Ok(Auditor {
    filter: word_filter,
  })
}

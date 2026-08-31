pub const DEFAULT_PAGE: u64 = 1;
pub const DEFAULT_PAGE_SIZE: u64 = 15;
pub const DEFAULT_CHAT_PAGE_SIZE: u64 = 30;
pub const DEFAULT_SUBMISSION_PAGE_SIZE: u64 = 10;
pub const MAX_PAGE_SIZE: u64 = 100;
pub const DEFAULT_LOG_LIMIT: usize = 1000;
pub const MAX_LOG_LIMIT: usize = 1000;

pub fn page(value: Option<u64>) -> u64 {
  value.unwrap_or(DEFAULT_PAGE).max(1)
}

pub fn page_size(value: Option<u64>, default: u64) -> u64 {
  value.unwrap_or(default).clamp(1, MAX_PAGE_SIZE)
}

pub fn limit(value: Option<usize>, default: usize, max: usize) -> usize {
  value.unwrap_or(default).clamp(1, max)
}

#[cfg(test)]
mod tests {
  use super::{DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, limit, page, page_size};

  #[test]
  fn page_defaults_to_one_and_never_falls_below_it() {
    assert_eq!(page(None), DEFAULT_PAGE);
    assert_eq!(page(Some(0)), 1);
    assert_eq!(page(Some(3)), 3);
  }

  #[test]
  fn page_size_clamps_to_configurable_default_and_global_max() {
    assert_eq!(page_size(None, DEFAULT_PAGE_SIZE), DEFAULT_PAGE_SIZE);
    assert_eq!(page_size(None, 30), 30);
    assert_eq!(page_size(Some(0), 15), 1);
    assert_eq!(page_size(Some(500), 15), MAX_PAGE_SIZE);
    assert_eq!(page_size(Some(20), 15), 20);
  }

  #[test]
  fn limit_clamps_between_one_and_caller_supplied_max() {
    assert_eq!(limit(None, 50, 1000), 50);
    assert_eq!(limit(Some(0), 50, 1000), 1);
    assert_eq!(limit(Some(2000), 50, 1000), 1000);
    assert_eq!(limit(Some(42), 50, 1000), 42);
  }
}

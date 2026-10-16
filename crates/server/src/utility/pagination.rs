pub const DEFAULT_PAGE: u64 = 1;
pub const DEFAULT_PAGE_SIZE: u64 = 15;
pub const DEFAULT_CHAT_MESSAGE_LIMIT: u64 = 50;
pub const DEFAULT_CHAT_SESSION_LIMIT: u64 = 20;
pub const DEFAULT_CHAT_SYNC_LIMIT: u64 = 100; // unread chunk cap for mode=sync
pub const CHAT_SYNC_CONTEXT_SIZE: u64 = 16; // read context returned by mode=sync
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

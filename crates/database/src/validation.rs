//! Shared field-level validation functions for entity models.
//!
//! These functions are referenced by `#[validate(custom(...))]` attributes on
//! entity models and request DTOs. Single-message rules take their text from
//! the attribute site via `message = ...`; multi-message rules carry their
//! messages inside the function via `with_message`.

use validator::ValidationError;

/// Maximum length of avatar references (media hashes) in characters.
pub const AVATAR_MAX_LEN: u64 = 255;

/// Number of unicode characters, matching the historic `char_len` semantics
/// of the server-side validators.
pub fn char_len(value: &str) -> usize {
  value.chars().count()
}

/// Fails when the value is empty or consists of whitespace only.
pub fn non_blank(value: &str) -> Result<(), ValidationError> {
  if value.trim().is_empty() {
    return Err(ValidationError::new("non_blank"));
  }
  Ok(())
}

/// Fails when a non-blank value is not an `http(s)` url or contains
/// whitespace. Blank values pass: the field is optional by definition.
pub fn optional_url(value: &str) -> Result<(), ValidationError> {
  if value.trim().is_empty() {
    return Ok(());
  }
  if (!value.starts_with("https://") && !value.starts_with("http://"))
    || value.chars().any(char::is_whitespace)
  {
    return Err(ValidationError::new("optional_url"));
  }
  Ok(())
}

/// Account handle: 4 to 32 characters of `[A-Za-z0-9_]`. The character class
/// is equivalent to the historic `account_str(account) == account` check:
/// deunicode maps every non-ascii character away from its class, so only
/// plain ascii alphanumerics and underscores ever passed.
pub fn account_handle(value: &str) -> Result<(), ValidationError> {
  let len = char_len(value);
  if len < 4 {
    return Err(
      ValidationError::new("account_too_short")
        .with_message("account must be at least 4 characters".into()),
    );
  }
  if len > 32 {
    return Err(
      ValidationError::new("account_too_long")
        .with_message("account must be at most 32 characters".into()),
    );
  }
  if !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
    return Err(
      ValidationError::new("account_charset")
        .with_message("account contains invalid characters".into()),
    );
  }
  Ok(())
}

/// Nickname: 2 to 32 characters.
pub fn nickname_len(value: &str) -> Result<(), ValidationError> {
  let len = char_len(value);
  if len < 2 {
    return Err(
      ValidationError::new("nickname_too_short")
        .with_message("nickname must be at least 2 characters".into()),
    );
  }
  if len > 32 {
    return Err(
      ValidationError::new("nickname_too_long")
        .with_message("nickname must be at most 32 characters".into()),
    );
  }
  Ok(())
}

/// Password strength as enforced by the frontend forms: 8 to 40 characters
/// with at least one lowercase letter, one uppercase letter and one digit.
pub fn password_strength(value: &str) -> Result<(), ValidationError> {
  let len = char_len(value);
  if !(8..=40).contains(&len)
    || !value.chars().any(|c| c.is_ascii_lowercase())
    || !value.chars().any(|c| c.is_ascii_uppercase())
    || !value.chars().any(|c| c.is_ascii_digit())
  {
    return Err(
      ValidationError::new("password_too_weak").with_message("password is too weak".into()),
    );
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::{account_handle, nickname_len, password_strength};

  #[test]
  fn account_handle_matches_frontend_valid_fields() {
    assert!(account_handle("Valid_User_01").is_ok());
  }

  #[test]
  fn account_handle_rejects_invalid_accounts() {
    assert!(account_handle("abc").is_err());
    assert!(account_handle(&"a".repeat(33)).is_err());
    assert!(account_handle("bad-user").is_err());
    assert!(account_handle("bad user").is_err());
    assert!(account_handle("测试_user").is_err());
  }

  #[test]
  fn nickname_len_enforces_bounds() {
    assert!(nickname_len("测试用户").is_ok());
    assert!(nickname_len("a").is_err());
    assert!(nickname_len(&"a".repeat(33)).is_err());
  }

  #[test]
  fn password_strength_matches_frontend_rule() {
    assert!(password_strength("StrongPass1").is_ok());
    assert!(password_strength("weakpass1").is_err());
    assert!(password_strength("WEAKPASS1").is_err());
    assert!(password_strength("WeakPass").is_err());
    assert!(password_strength(&"Aa1".repeat(14)).is_err());
  }
}

//! String utils
//!
//! Currently contains deunicode function.

use deunicode::deunicode_with_tofu;
use sanitizer::StringSanitizer;

/// Convert any unicode string into a path-safe string.
///
/// Assume that we have a string "你好世界", it will be converted to
/// "ni_hao_shi_jie".
///
/// It maybe slow due to a huge map lookup, so plz do not use it with a long
/// input.
pub fn deunicode_str(s: impl AsRef<str>) -> String {
    let mut sanitizer = StringSanitizer::from(deunicode_with_tofu(s.as_ref(), "_"));
    sanitizer.trim().to_snake_case();
    sanitizer.get()
}

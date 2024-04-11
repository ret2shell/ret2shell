//! String utils
//!
//! Currently contains deunicode function.

use std::collections::HashMap;

use deunicode::deunicode_with_tofu;
use once_cell::sync::Lazy;
use sanitizer::StringSanitizer;

static ALTER_CHAR_TABLE: Lazy<HashMap<u8, Vec<u8>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(b'0', vec![b'0', b'O', b'o']);
    map.insert(b'1', vec![b'1', b'I', b'l']);
    map.insert(b'2', vec![b'2', b'Z', b'z']);
    map.insert(b'3', vec![b'3', b'E', b'e']);
    map.insert(b'4', vec![b'4', b'@', b'a']);
    map.insert(b'6', vec![b'6', b'b', b'B']);
    map.insert(b'a', vec![b'a', b'@', b'4']);
    map.insert(b'b', vec![b'b', b'B', b'6']);
    map.insert(b'e', vec![b'e', b'E', b'3']);
    map.insert(b'g', vec![b'g', b'G', b'9']);
    map.insert(b'i', vec![b'i', b'I', b'1']);
    map.insert(b'l', vec![b'l', b'L', b'1']);
    map.insert(b'o', vec![b'o', b'O', b'0']);
    map.insert(b'q', vec![b'q', b'Q', b'9']);
    map.insert(b'r', vec![b'r', b'R', b'2']);
    map.insert(b's', vec![b's', b'S', b'5']);
    map.insert(b't', vec![b't', b'T', b'7']);
    map.insert(b'z', vec![b'z', b'Z', b'2']);
    map.insert(b'A', vec![b'A', b'@', b'4']);
    map.insert(b'B', vec![b'B', b'b', b'8']);
    map.insert(b'E', vec![b'E', b'e', b'3']);
    map.insert(b'G', vec![b'G', b'g', b'9']);
    map.insert(b'I', vec![b'I', b'i', b'1']);
    map.insert(b'L', vec![b'L', b'l', b'1']);
    map.insert(b'O', vec![b'O', b'o', b'0']);
    map.insert(b'Q', vec![b'Q', b'q', b'9']);
    map.insert(b'R', vec![b'R', b'r', b'2']);
    map.insert(b'S', vec![b'S', b's', b'5']);
    map.insert(b'T', vec![b'T', b't', b'7']);
    map.insert(b'Z', vec![b'Z', b'z', b'2']);
    map
});
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

pub fn leet_str(s: impl AsRef<str>) -> String {
    let mut result = String::new();
    for c in s.as_ref().bytes() {
        if let Some(alter) = ALTER_CHAR_TABLE.get(&c) {
            let idx = rand::random::<usize>() % alter.len();
            result.push(alter[idx] as char);
        } else {
            result.push(c as char);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deunicode_str() {
        assert_eq!(deunicode_str("你好世界@#$^%^%*&#"), "ni_hao_shi_jie");
        assert_eq!(
            deunicode_str("✨1日目✨#原神アプデ記念キャンペーン！"),
            "sparkles_1ri_mu_sparkles_yuan_shen_apude_ji_nian_kiyanpen"
        );
    }
}

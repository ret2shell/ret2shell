//! String utils
//!
//! Currently contains deunicode and leet helpers.

use std::collections::HashMap;

use deunicode::deunicode_with_tofu;
use heck::ToSnakeCase;
use once_cell::sync::Lazy;
use rand::RngExt;

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

pub fn deunicode_str(s: impl AsRef<str>, keep_case: bool) -> String {
  let result = deunicode_with_tofu(&s.as_ref().replace(" ", "_"), "_")
    .trim()
    .to_owned();
  if keep_case {
    result.replace(" ", "")
  } else {
    result.to_snake_case()
  }
}

pub fn account_str(s: impl AsRef<str>) -> String {
  deunicode_str(s, true)
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
    .collect()
}

pub fn leet_str(s: impl AsRef<str>) -> String {
  let mut result = String::new();
  for c in s.as_ref().bytes() {
    if let Some(alter) = ALTER_CHAR_TABLE.get(&c) {
      let idx = rand::rng().random::<u32>() as usize % alter.len();
      result.push(alter[idx] as char);
    } else {
      result.push(c as char);
    }
  }
  result
}

#[cfg(test)]
mod tests {
  use std::collections::HashSet;

  use super::{account_str, deunicode_str, leet_str};

  #[test]
  fn deunicode_keeps_ascii_layout_for_keep_case_and_snake_cases_otherwise() {
    assert_eq!(deunicode_str("Hello World", true), "Hello_World");
    assert_eq!(deunicode_str("Hello World", false), "hello_world");
    // plain ASCII passes through unchanged.
    assert_eq!(deunicode_str("padded", true), "padded");
    assert!(deunicode_str("", true).is_empty());
  }

  #[test]
  fn account_str_keeps_only_alphanumerics_and_underscores() {
    let filtered = account_str("User.Name-x +01!");
    assert!(!filtered.is_empty());
    assert!(
      filtered
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_'),
      "unexpected chars in {filtered}"
    );
    assert_eq!(account_str("plain_1"), "plain_1");
  }

  #[test]
  fn leet_str_preserves_length_and_stays_within_candidate_sets() {
    let candidates: [(u8, &[u8]); 11] = [
      (b'l', b"lL1"),
      (b'e', b"eE3"),
      (b'e', b"eE3"),
      (b't', b"tT7"),
      (b'0', b"0Oo"),
      (b'1', b"1Il"),
      (b'2', b"2Zz"),
      (b'3', b"3Ee"),
      (b'z', b"zZ2"),
      (b'-', b"-"),
      (b'=', b"="),
    ];
    let input = "leet0123z-=";
    for _ in 0..32 {
      let output = leet_str(input);
      assert_eq!(output.len(), input.len());
      for (i, out_char) in output.bytes().enumerate() {
        assert!(
          candidates[i].1.contains(&out_char),
          "byte {out_char} at {i} not in candidate set"
        );
      }
    }
    let mut outputs = HashSet::new();
    for _ in 0..64 {
      outputs.insert(leet_str("leet"));
    }
    assert!(outputs.len() > 1, "leet_str should be randomized");
  }
}

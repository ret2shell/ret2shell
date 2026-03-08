const CHARS_TABLE: [&str; 16] = [
  "呐~",
  "ヘ(￣ω￣ヘ)",
  "嗷呜~~",
  "(｢･ω･)｢",
  "๑乛◡乛๑",
  "欧尼酱>w<",
  "(//▽//)",
  "(*^3^)",
  "喵~0w0",
  "╮(๑•́₃•̀๑)╭",
  "(ฅ´ω`ฅ)",
  "(=￣ω￣=)",
  "zaku~zaku~~",
  "(≧ω≦)",
  "(๑>m<๑)",
  "<(▰˘◡˘▰)>",
];

pub fn encode(data: &[u8]) -> String {
  let mut result = String::new();
  for byte in data {
    // one byte is 8 bits, so we can split it into two 4-bit parts
    // and use them as indices to the CHARS_TABLE
    let index1 = (byte >> 4) as usize;
    let index2 = (byte & 0x0F) as usize;
    result.push_str(CHARS_TABLE[index1]);
    result.push(' ');
    result.push_str(CHARS_TABLE[index2]);
    result.push(' ');
  }
  result
}

pub fn decode(data: &str) -> Option<Vec<u8>> {
  let mut result = Vec::new();
  let mut iter = data.split_ascii_whitespace();
  while let Some(index1) = iter.next() {
    if index1.is_empty() {
      continue;
    }
    let index1 = CHARS_TABLE.iter().position(|&x| x == index1)?;
    let index2 = iter.next()?;
    if index2.is_empty() {
      continue;
    }
    let index2 = CHARS_TABLE.iter().position(|&x| x == index2)?;
    result.push(((index1 as u8) << 4) | index2 as u8);
  }
  Some(result)
}

#[cfg(test)]
mod tests {
  use super::{decode, encode};

  #[test]
  fn codec_roundtrips_binary_payloads() {
    let payload = [0x00, 0x1F, 0x80, 0xAB, 0xFF];

    let encoded = encode(&payload);
    let decoded = decode(&encoded).unwrap();

    assert_eq!(decoded, payload);
  }

  #[test]
  fn decode_rejects_invalid_tokens_and_odd_pairs() {
    assert_eq!(decode("totally-invalid"), None);
    assert_eq!(decode("呐~"), None);
  }

  #[test]
  fn decode_ignores_surrounding_whitespace() {
    let encoded = encode(&[0x42]);

    assert_eq!(decode(&format!("  {encoded}  \n\t")).unwrap(), vec![0x42]);
    assert_eq!(decode(""), Some(Vec::new()));
  }
}

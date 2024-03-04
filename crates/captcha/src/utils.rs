//! Hashing utility functions

use ring::digest::{Context, SHA256};

/// Calculate the sha256 value of a string, returns a hex string.
pub fn sha256sum_str(message: &str) -> String {
    let mut context = Context::new(&SHA256);
    context.update(message.as_bytes());
    hex::encode(context.finish().as_ref())
}

#[cfg(test)]
mod tests {
    use super::sha256sum_str;

    #[test]
    fn test_sha256() {
        assert!(sha256sum_str("Hello World!")
            .eq("7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"))
    }
}

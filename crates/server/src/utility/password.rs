//! Hashing utility functions

use argon2::{
  Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
  password_hash::{SaltString, rand_core::OsRng},
};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PasswordHashingError {
  #[error("bcrypt error: {0}")]
  BcryptError(#[from] bcrypt::BcryptError),
  #[error("argon2 error: {0}")]
  Argon2Error(argon2::password_hash::Error),
}

pub fn hash_password(password: &str) -> Result<String, PasswordHashingError> {
  let salt = SaltString::generate(&mut OsRng);

  // Argon2 with default params (Argon2id v19)
  let argon2 = Argon2::default();

  // Hash password to PHC string ($argon2id$v=19$...)
  let password_hash = argon2
    .hash_password(password.as_bytes(), &salt)
    .map_err(PasswordHashingError::Argon2Error)?
    .to_string();
  Ok(password_hash)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, PasswordHashingError> {
  if hash.starts_with("$argon2") {
    let parsed_hash = PasswordHash::new(hash).map_err(PasswordHashingError::Argon2Error)?;
    Ok(
      Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok(),
    )
  } else {
    Ok(bcrypt::verify(password, hash)?)
  }
}

#[cfg(test)]
mod tests {
  use super::{hash_password, verify_password};

  #[test]
  fn argon_hashes_round_trip_and_reject_wrong_passwords() {
    let hash = hash_password("p@ssword🔐").unwrap();

    assert!(hash.starts_with("$argon2"));
    assert!(verify_password("p@ssword🔐", &hash).unwrap());
    assert!(!verify_password("wrong-password", &hash).unwrap());
  }

  #[test]
  fn verify_password_supports_legacy_bcrypt_hashes() {
    let hash = bcrypt::hash("legacy-password", bcrypt::DEFAULT_COST).unwrap();

    assert!(verify_password("legacy-password", &hash).unwrap());
    assert!(!verify_password("not-it", &hash).unwrap());
  }

  #[test]
  fn malformed_hashes_return_errors() {
    assert!(verify_password("password", "not-a-valid-hash").is_err());
  }
}

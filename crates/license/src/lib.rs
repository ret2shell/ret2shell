use std::path::Path;

use codec::decode;
use ring::signature;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub mod codec;

// Predefined paths for the configuration file.
const LICENSE_PREDEFINED_PATH: [&str; 3] = ["/etc/ret2shell/", "~/.config/ret2shell/", "./config/"];
// Predefined file name for the configuration file.
const LICENSE_PREDEFINED_FILE_NAME: &str = "license";

#[derive(Error, Debug)]
pub enum LicenseError {
    #[error("License is missing.")]
    Missing,
    #[error("License is invalid.")]
    Invalid,
    #[error("License is expired.")]
    Expired,
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum LicenseLevel {
    Free,
    Pro,
    Enterprise,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct License {
    pub issuer: String,
    pub website: String,
    pub date: String,
    pub level: LicenseLevel,
}

/// A simple license check function.
/// it's easy to crack or patch so...
/// implementing this one is just a formality.
pub fn check_license(pub_key: &[u8]) -> Result<License, LicenseError> {
    let mut license_str = String::new();
    let mut ok = false;
    for path in LICENSE_PREDEFINED_PATH.iter() {
        let path = match Path::new(path).canonicalize() {
            Ok(p) => p,
            Err(_) => continue,
        };
        // println!("config file path is: {path:?}");
        let file_path = path.join(LICENSE_PREDEFINED_FILE_NAME);
        match std::fs::read_to_string(&file_path) {
            Ok(s) => {
                license_str = s;
                ok = true;
                break;
            }
            Err(_) => continue,
        }
    }
    if !ok || license_str.is_empty() {
        return Err(LicenseError::Missing);
    }
    let (cert, sig) = license_str.split_once('\n').ok_or(LicenseError::Invalid)?;

    let cert = decode(cert).ok_or(LicenseError::Invalid)?;
    let sig = decode(sig).ok_or(LicenseError::Invalid)?;
    let cert = String::from_utf8(cert).map_err(|_| LicenseError::Invalid)?;
    let keypair = signature::UnparsedPublicKey::new(&signature::ED25519, pub_key);
    if keypair.verify(cert.as_bytes(), &sig).is_err() {
        return Err(LicenseError::Invalid);
    }
    let license: License = serde_json::from_str(&cert).map_err(|_| LicenseError::Invalid)?;
    let date = chrono::NaiveDate::parse_from_str(&license.date, "%Y-%m-%d")
        .map_err(|_| LicenseError::Invalid)?;
    if date < chrono::Utc::now().naive_utc().into() {
        return Err(LicenseError::Expired);
    }
    Ok(license)
}

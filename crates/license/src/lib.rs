use std::path::Path;

use base64::Engine;
use ring::signature;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// Predefined paths for the configuration file.
const LICENSE_PREDEFINED_PATH: [&str; 3] = ["/etc/ret2shell/", "~/.config/ret2shell/", "./config/"];
// Predefined file name for the configuration file.
const LICENSE_PREDEFINED_FILE_NAME: &str = "license";

const PUB_KEY: &[u8] = include_bytes!("../../../config/pub.bin");

#[derive(Error, Debug)]
pub enum LicenseError {
    #[error("License is missing.")]
    Missing,
    #[error("License is invalid.")]
    Invalid,
    #[error("License is expired.")]
    Expired,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct License {
    pub issuer: String,
    pub website: String,
    pub date: String,
}

/// A simple license check function.
/// it's easy to crack or patch so....
/// implementing this one is just a formality.
pub fn check_license() -> Result<License, LicenseError> {
    let mut config_str = String::new();
    let mut file_path = String::new();
    for path in LICENSE_PREDEFINED_PATH.iter() {
        let path = match Path::new(path).canonicalize() {
            Ok(p) => p,
            Err(_) => continue,
        };
        // println!("config file path is: {path:?}");
        let path = path.display();
        file_path = format!("{path}/{LICENSE_PREDEFINED_FILE_NAME}");
        match std::fs::read_to_string(&file_path) {
            Ok(s) => {
                config_str = s;
                break;
            }
            Err(_) => continue,
        }
    }
    if file_path.is_empty() || config_str.is_empty() {
        return Err(LicenseError::Missing);
    }
    let (cert, sig) = config_str.split_once('.').ok_or(LicenseError::Invalid)?;
    let cert = base64::engine::general_purpose::STANDARD
        .decode(cert)
        .map_err(|_| LicenseError::Invalid)?;
    let sig = base64::engine::general_purpose::STANDARD
        .decode(sig)
        .map_err(|_| LicenseError::Invalid)?;
    let cert = String::from_utf8(cert).map_err(|_| LicenseError::Invalid)?;
    let keypair = signature::UnparsedPublicKey::new(&signature::ED25519, PUB_KEY);
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

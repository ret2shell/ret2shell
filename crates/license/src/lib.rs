use std::path::Path;

use base64::Engine;
use ring::signature;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// Predefined paths for the configuration file.
const LICENSE_PREDEFINED_PATH: [&str; 3] = ["/etc/ret2shell/", "~/.config/ret2shell/", "./config/"];
// Predefined file name for the configuration file.
const LICENSE_PREDEFINED_FILE_NAME: &str = "license";

const BASE64_TABLE: [u8; 65] =
    *b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

const TAICHI_TABLE: [char; 65] = [
    '喵', '咩', '哞', '汪', '咪', '吱', '嗷', '呜', '嗯', '啊', '喔', '咯', '㕹', '啾', '唧', '呱',
    '嗡', '呦', '咿', '嘶', '嗥', '吼', '嗒', '呿', '狺', '啸', '鸣', '吠', '啼', '唳', '哼', '啭',
    '啁', '咴', '嚎', '谷', '咕', '喳', '噌', '砉', '邕', '唼', '喋', '桀', '轰', '啵', '哦', '哈',
    '咔', '怦', '嚓', '呀', '簌', '呼', '噼', '啪', '叮', '哎', '唉', '哟', '嘤', '啦', '叭', '𠺢',
    '呐',
];

fn find_table_index<const U: usize, T>(table: [T; U], key: T) -> Option<usize>
where
    T: Eq + PartialEq,
{
    for x in table.iter().enumerate() {
        if *x.1 == key {
            return Some(x.0);
        }
    }
    None
}

pub fn taichi_to_base64(taiji: &str) -> String {
    let mut base64 = String::new();
    for c in taiji.chars() {
        if let Some(index) = find_table_index(TAICHI_TABLE, c) {
            base64.push(BASE64_TABLE[index] as char);
        } else {
            base64.push(c);
        }
    }
    base64
}

pub fn base64_to_taichi(base64: &str) -> String {
    let mut taiji = String::new();
    for c in base64.chars() {
        if let Some(index) = find_table_index(BASE64_TABLE, c as u8) {
            taiji.push(TAICHI_TABLE[index]);
        } else {
            taiji.push(c);
        }
    }
    taiji
}

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
    let cert = taichi_to_base64(cert);
    let sig = taichi_to_base64(sig);
    let cert = base64::engine::general_purpose::STANDARD
        .decode(cert)
        .map_err(|_| LicenseError::Invalid)?;
    let sig = base64::engine::general_purpose::STANDARD
        .decode(sig)
        .map_err(|_| LicenseError::Invalid)?;
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

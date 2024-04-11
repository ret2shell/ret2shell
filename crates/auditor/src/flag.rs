use std::collections::HashMap;

use once_cell::sync::Lazy;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum FlagError {
    #[error("encrypted length does not match: {0}")]
    EncryptedLengthMismatch(String),
    #[error("flag data broken: {0}")]
    FlagDataBroken(String),
}

static ALTER_CHAR_TABLE: Lazy<HashMap<u8, Vec<u8>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(b'0', vec![b'O', b'o']);
    map.insert(b'1', vec![b'I', b'l']);
    map.insert(b'2', vec![b'Z', b'z']);
    map.insert(b'3', vec![b'E', b'e']);
    map.insert(b'4', vec![b'@', b'a']);
    map.insert(b'6', vec![b'b', b'B']);
    map.insert(b'a', vec![b'@', b'4']);
    map.insert(b'b', vec![b'B', b'6']);
    map.insert(b'e', vec![b'E', b'3']);
    map.insert(b'g', vec![b'G', b'9']);
    map.insert(b'i', vec![b'I', b'1']);
    map.insert(b'l', vec![b'L', b'1']);
    map.insert(b'o', vec![b'O', b'0']);
    map.insert(b'q', vec![b'Q', b'9']);
    map.insert(b'r', vec![b'R', b'2']);
    map.insert(b's', vec![b'S', b'5']);
    map.insert(b't', vec![b'T', b'7']);
    map.insert(b'z', vec![b'Z', b'2']);
    map.insert(b'A', vec![b'@', b'4']);
    map.insert(b'B', vec![b'b', b'8']);
    map.insert(b'E', vec![b'e', b'3']);
    map.insert(b'G', vec![b'g', b'9']);
    map.insert(b'I', vec![b'i', b'1']);
    map.insert(b'L', vec![b'l', b'1']);
    map.insert(b'O', vec![b'o', b'0']);
    map.insert(b'Q', vec![b'q', b'9']);
    map.insert(b'R', vec![b'r', b'2']);
    map.insert(b'S', vec![b's', b'5']);
    map.insert(b'T', vec![b't', b'7']);
    map.insert(b'Z', vec![b'z', b'2']);
    map.insert(b'_', vec![b'-', b'.']);
    map.insert(b'-', vec![b'_', b'=']);
    map.insert(b'.', vec![b'-', b'_']);
    map.insert(b'=', vec![b'-', b'_']);
    map.insert(b'!', vec![b'_', b'-']);
    map.insert(b'@', vec![b'A', b'a']);
    map
});

const DELTA: u32 = 0x9E3779B9;

fn to_bytes(v: &[u32], include_length: bool) -> Vec<u8> {
    let length: u32 = v.len() as u32;
    let mut n: u32 = length << 2;
    if include_length {
        let m: u32 = v[length as usize - 1];
        n -= 4;
        assert!(!((m < n - 3) || (m > n)));
        n = m;
    }
    let mut bytes: Vec<u8> = vec![0; n as usize];
    for i in 0..n {
        bytes[i as usize] = (v[(i >> 2) as usize] >> ((i & 3) << 3)) as u8;
    }
    bytes
}

fn to_u32(bytes: &[u8], include_length: bool) -> Vec<u32> {
    let length: u32 = bytes.len() as u32;
    let mut n: u32 = length >> 2;
    if length & 3 != 0 {
        n += 1;
    }
    let mut v;
    if include_length {
        v = vec![0; n as usize + 1];
        v[n as usize] = length;
    } else {
        v = vec![0; n as usize];
    }
    for i in 0..length {
        v[(i >> 2) as usize] |= (bytes[i as usize] as u32) << ((i & 3) << 3);
    }
    v
}

fn mx(sum: u32, y: u32, z: u32, p: u32, e: u32, k: &[u32]) -> u32 {
    ((z >> 5 ^ y << 2).wrapping_add(y >> 3 ^ z << 4))
        ^ ((sum ^ y).wrapping_add(k[(p & 3 ^ e) as usize] ^ z))
}

fn fixk(k: &[u32]) -> Vec<u32> {
    let mut key = k.to_owned();
    if key.len() < 4 {
        let length = key.len();
        for _ in length..4 {
            key.push(0)
        }
    }
    key
}

fn encrypt_(v: &mut [u32], k: &[u32]) -> Vec<u32> {
    let length: u32 = v.len() as u32;
    let n: u32 = length - 1;
    let key: Vec<u32> = fixk(k);
    let mut e: u32;
    let mut y: u32;
    let mut z = v[n as usize];
    let mut sum: u32 = 0;
    let mut q: u32 = 6 + 52 / length;
    while q > 0 {
        sum = sum.wrapping_add(DELTA);
        e = sum >> 2 & 3;
        for p in 0..n {
            y = v[(p as usize) + 1];
            v[p as usize] = v[p as usize].wrapping_add(mx(sum, y, z, p, e, &key));
            z = v[p as usize];
        }
        y = v[0];
        v[n as usize] = v[n as usize].wrapping_add(mx(sum, y, z, n, e, &key));
        z = v[n as usize];
        q -= 1;
    }
    v.to_owned()
}

fn decrypt_(v: &mut [u32], k: &[u32]) -> Vec<u32> {
    let length: u32 = v.len() as u32;
    let n: u32 = length - 1;
    let key: Vec<u32> = fixk(k);
    let mut e: u32;
    let mut y: u32 = v[0];
    let mut z;
    let q: u32 = 6 + 52 / length;
    let mut sum: u32 = q.wrapping_mul(DELTA);
    while sum != 0 {
        e = sum >> 2 & 3;
        let mut p: usize = n as usize;
        while p > 0 {
            z = v[p - 1];
            v[p] = v[p].wrapping_sub(mx(sum, y, z, p as u32, e, &key));
            y = v[p];
            p -= 1;
        }
        z = v[n as usize];
        v[0] = v[0].wrapping_sub(mx(sum, y, z, 0, e, &key));
        y = v[0];
        sum = sum.wrapping_sub(DELTA);
    }
    v.to_owned()
}

/// Encrypt a u8 vector with XXTEA
///
/// *Note:* XXTEA works on 32 bit words. If input is not evenly dividable by
/// four, it will be padded with zeroes. Padding information is lost after the
/// encryption and this needs to be taken into consideration when decrypting
/// messages.
///
/// # Arguments
///
/// * `data` - The data to be encrypted
/// * `key` - encryption key
///
/// # Example
///
/// ```
/// let key : &str = "SecretKey";
/// let data : [u8; 5] = [11, 13, 0, 14, 15];
///
/// let encrypted_data = xxtea::encrypt_raw(&data.to_vec(), &key);
/// // encrypted data will be 8 bytes (3 zeroes appended to the end)
/// println!("Encrypted data: {:?}", encrypted_data);
/// ```
pub fn encrypt_raw(data: &[u8], key: &str) -> Vec<u8> {
    let key = key.as_bytes();
    to_bytes(
        &encrypt_(&mut to_u32(data, false), &to_u32(key, false)),
        false,
    )
}

/// Decrypt a u8 vector with XXTEA
///
/// The output isn't verified for correctness, thus additional checks needs to
/// be performed on the output.
///
/// # Arguments
///
/// * `data` - The data to be decrypted
/// * `key` - encryption key
///
/// # Example
///
/// ```
/// let key : &str = "SecretKey";
/// let data : [u8; 5] = [11, 13, 0, 14, 15];
///
/// let decrypted_data = xxtea::decrypt_raw(&data.to_vec(), &key);
/// println!("Decrypted data: {:?}", decrypted_data);
/// ```
pub fn decrypt_raw(data: &[u8], key: &str) -> Vec<u8> {
    let key = key.as_bytes();
    to_bytes(
        &decrypt_(&mut to_u32(data, false), &to_u32(key, false)),
        false,
    )
}

fn get_flag_valid_part(flag: &str) -> String {
    let mut flag_valid_part = String::new();
    for c in flag.to_string().bytes() {
        // if ALTER_TABLE's value contains c
        // then c is valid
        if ALTER_CHAR_TABLE.contains_key(&c)
            || ALTER_CHAR_TABLE.values().any(|x| x.iter().any(|&y| y == c))
        {
            flag_valid_part.push(c as char);
        }
    }
    flag_valid_part
}

fn get_flag_template_valid_part(flag_template: &str) -> String {
    let mut flag_template_valid_part = String::new();
    for c in flag_template.to_string().bytes() {
        // if ALTER_TABLE's key contains c
        // then c is valid
        if ALTER_CHAR_TABLE.contains_key(&c) {
            flag_template_valid_part.push(c as char);
        }
    }
    flag_template_valid_part
}

pub fn insert_user_id(flag_template: &str, user_id: i64) -> Result<String, FlagError> {
    // turn user_id into Vec<u8> which has 8 bytes
    let user_id = user_id.to_be_bytes();
    let encrypted_user_id = encrypt_raw(&Vec::from(user_id), "TH3-G3NU1NE-REVERIER");
    if encrypted_user_id.len() != 8 {
        return Err(FlagError::EncryptedLengthMismatch(format!(
            "encrypted_user_id.len() = {}",
            encrypted_user_id.len()
        )));
    }
    // turn 64 bit encrypted_user_id to u64
    let mut encrypted_user_id =
        u64::from_be_bytes((&encrypted_user_id[0..8]).try_into().map_err(|err| {
            FlagError::FlagDataBroken(format!("user_id = {:?}, err = {:?}", user_id, err))
        })?);
    // println!("encrypted_user_id = {}", encrypted_user_id);
    let mut flag = String::new();
    // iterate over flag_template
    for c in flag_template.to_string().bytes() {
        if ALTER_CHAR_TABLE.contains_key(&c) {
            // if encrypted_user_id % 3 == 0, use the key as result
            // otherwise, use the value as result
            if encrypted_user_id % 3 == 0 {
                flag.push(c as char);
            } else {
                flag.push(
                    ALTER_CHAR_TABLE.get(&c).unwrap()[(encrypted_user_id % 3 - 1) as usize] as char,
                );
            }
            encrypted_user_id /= 3;
        } else {
            flag.push(c as char);
        }
    }
    while encrypted_user_id > 0 {
        if encrypted_user_id % 3 == 0 {
            flag.push('0');
        } else {
            flag.push(
                ALTER_CHAR_TABLE.get(&b'0').unwrap()[(encrypted_user_id % 3 - 1) as usize] as char,
            );
        }
        encrypted_user_id /= 3;
    }

    Ok(flag)
}

pub fn get_user_id_from_flag(flag_template: &str, flag: &str) -> Result<i64, FlagError> {
    let flag_valid_part: Vec<u8> = get_flag_valid_part(flag).to_string().into_bytes();
    let flag_template_valid_part: Vec<u8> = get_flag_template_valid_part(flag_template)
        .to_string()
        .into_bytes();
    let mut encrypted_user_id: Vec<u8> = Vec::new();
    // iterate over flag_valid_part
    let mut i = 0;
    let length = flag_template_valid_part.len();
    let flag_length = flag_valid_part.len();
    while i < flag_length {
        let original_char = if i < length {
            flag_template_valid_part[i]
        } else {
            b'0'
        };
        let encrypted_char = flag_valid_part[i];
        if original_char == encrypted_char {
            encrypted_user_id.push(0);
        } else if ALTER_CHAR_TABLE.get(&original_char).unwrap()[0] == encrypted_char {
            encrypted_user_id.push(1);
        } else if ALTER_CHAR_TABLE.get(&original_char).unwrap()[1] == encrypted_char {
            encrypted_user_id.push(2);
        } else {
            return Err(FlagError::FlagDataBroken(format!(
                "original_char = {:?}, encrypted_char = {:?}",
                String::from_utf8(original_char.to_be_bytes().to_vec()),
                String::from_utf8(encrypted_char.to_be_bytes().to_vec())
            )));
        }
        i += 1;
    }
    let mut user_id: i64 = 0;
    for (i, item) in encrypted_user_id.iter().enumerate() {
        user_id = user_id
            .overflowing_add(
                (*item as i64)
                    .overflowing_mul(3_i64.overflowing_pow(i as u32).0)
                    .0,
            )
            .0;
    }
    let user_id = decrypt_raw(&Vec::from(user_id.to_be_bytes()), "TH3-G3NU1NE-REVERIER");
    let user_id = i64::from_be_bytes((&user_id[0..8]).try_into().map_err(|err| {
        FlagError::FlagDataBroken(format!("user_id = {:?}, err = {:?}", user_id, err))
    })?);

    Ok(user_id)
}

#[cfg(test)]
mod test {
    use super::*;
    #[test]
    fn test() {
        let flag = insert_user_id("welcome_to_the_world_of_CTF!", 3307);
        println!("{:?}", flag);
        assert!(flag.is_ok());
        let flag = flag.unwrap();
        let user_id = get_user_id_from_flag("welcome_to_the_world_of_CTF!", &flag);
        println!("{:?}", user_id);
        assert!(user_id.is_ok());
        assert_eq!(user_id.unwrap(), 3307);
    }
}

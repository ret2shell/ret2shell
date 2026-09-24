use std::path::{Path, PathBuf};

use deunicode::deunicode_with_tofu;
use r2s_config::cluster::ChallengeEnv;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{
  fs::{File, create_dir, read_dir, read_to_string, write},
  io::AsyncRead,
};
use tracing::debug;

use crate::traits::{BucketError, init_dir};

#[derive(Debug)]
pub struct ChallengeBucket {
  pub name: String,
  pub path: PathBuf,
  pub locked: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScoreRule {
  pub initial: i32,
  pub minimum: i32,
  pub decay: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tag {
  name: String,
  primary: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TagList(pub Vec<Tag>);

#[derive(Serialize, Deserialize)]
pub struct ChallengeConfig {
  pub name: String,
  pub tag: TagList,
  pub score_rule: ScoreRule,
  /// Media hash of the challenge avatar, same convention as `game.logo`.
  pub avatar: Option<String>,
  /// Bucket names of the prerequisite challenges. Challenge ids are not
  /// persistent, so the git repository always refers to challenges by their
  /// bucket names.
  #[serde(default)]
  pub prerequisites: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Hint {
  pub content: String,
  pub cost: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Hints {
  pub hints: Vec<Hint>,
}

impl ChallengeBucket {
  pub async fn open(
    root_path: impl AsRef<Path>, name: impl AsRef<str>, locked: bool,
  ) -> Result<Self, BucketError> {
    let challenge_path = root_path.as_ref().join(name.as_ref());
    if !challenge_path.exists() {
      return Err(BucketError::PathDoesNotExist(
        challenge_path.display().to_string(),
      ));
    }
    Ok(Self {
      name: name.as_ref().to_owned(),
      path: challenge_path,
      locked,
    })
  }

  pub async fn new(
    root_path: impl AsRef<Path>, name: impl AsRef<str>, config: ChallengeConfig,
  ) -> Result<Self, BucketError> {
    let challenge_path = root_path.as_ref().join(name.as_ref());
    if challenge_path.exists() {
      return Err(BucketError::PathConflict(
        challenge_path.display().to_string(),
      ));
    }
    create_dir(&challenge_path).await?;
    init_dir!(challenge_path, "mapped");
    init_dir!(challenge_path, "checker");
    init_dir!(challenge_path, "src");
    init_dir!(challenge_path, "static");
    write(
      &challenge_path.join("config.toml"),
      toml::to_string_pretty(&config)?,
    )
    .await?;

    Ok(Self {
      name: name.as_ref().to_owned(),
      path: challenge_path,
      locked: true,
    })
  }

  pub fn path(&self) -> &Path {
    &self.path
  }

  pub async fn set_config(&self, config: Value) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    let config: ChallengeConfig = serde_json::from_value(config)?;
    write(
      &self.path.join("config.toml"),
      toml::to_string_pretty(&config)?,
    )
    .await?;
    Ok(())
  }

  pub async fn config(&self) -> Result<ChallengeConfig, BucketError> {
    let config = toml::from_str(&read_to_string(&self.path.join("config.toml")).await?)?;
    Ok(config)
  }

  pub async fn set_env(&self, config: Value) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    let config: ChallengeEnv = serde_json::from_value(config)?;
    write(
      &self.path.join("env.toml"),
      toml::to_string_pretty(&config)?,
    )
    .await?;

    Ok(())
  }

  pub async fn env(&self) -> Result<Option<ChallengeEnv>, BucketError> {
    let path = self.path.join("env.toml");
    if !path.exists() {
      return Ok(None);
    }
    let config = toml::from_str(&read_to_string(&path).await?)?;
    Ok(Some(config))
  }

  pub async fn delete_env(&self) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    tokio::fs::remove_file(self.path.join("env.toml")).await?;
    Ok(())
  }

  pub async fn set_hints(&self, hints: Hints) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    write(
      &self.path.join("hints.toml"),
      toml::to_string_pretty(&hints)?,
    )
    .await?;
    Ok(())
  }

  pub async fn hints(&self) -> Result<Hints, BucketError> {
    let path = self.path.join("hints.toml");
    if !path.exists() {
      return Ok(Hints { hints: vec![] });
    }
    let config = toml::from_str(&read_to_string(&path).await?)?;
    Ok(config)
  }

  pub async fn set_description(&self, description: String) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    write(&self.path.join("README.md"), description.as_bytes()).await?;
    Ok(())
  }

  pub async fn description(&self) -> Result<String, BucketError> {
    let path = self.path.join("README.md");
    if !path.exists() {
      return Ok("".to_owned());
    }
    Ok(read_to_string(&path).await?)
  }

  pub async fn set_answer(&self, answer: String) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    write(&self.path.join("answer.md"), answer.as_bytes()).await?;
    Ok(())
  }

  pub async fn answer(&self) -> Result<String, BucketError> {
    let path = self.path.join("answer.md");
    if !path.exists() {
      return Ok("".to_owned());
    }
    Ok(read_to_string(&path).await?)
  }

  pub async fn set_checker(&self, checker: String) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    write(
      &self.path.join("checker").join("main.rx"),
      checker.as_bytes(),
    )
    .await?;
    Ok(())
  }

  pub async fn checker(&self) -> Result<String, BucketError> {
    let path = self.path.join("checker").join("main.rx");
    if !path.exists() {
      return Ok("".to_owned());
    }
    Ok(read_to_string(&path).await?)
  }

  async fn upload_file(
    &self, dest: impl AsRef<str>, name: impl AsRef<str>, mut stdin: impl AsyncRead + Send + Unpin,
  ) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    if !matches!(
      dest.as_ref(),
      "images" | "mapped" | "checker" | "src" | "static"
    ) {
      return Err(BucketError::PathDoesNotExist(dest.as_ref().to_owned()));
    }
    let name = to_file_name(name.as_ref());
    let dest_path = self.path.join(dest.as_ref()).join(&name);
    let mut file = tokio::fs::File::create(&dest_path).await?;
    debug!(dest=?dest_path, file=?name, "uploading to bucket");
    tokio::io::copy(&mut stdin, &mut file).await?;

    Ok(())
  }

  async fn delete_file(
    &self, dest: impl AsRef<str>, name: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    if !self.locked {
      return Err(BucketError::NeedLocking);
    }
    if !matches!(dest.as_ref(), "mapped" | "checker" | "src" | "static") {
      return Err(BucketError::PathDoesNotExist(dest.as_ref().to_owned()));
    }
    let dest_path = self.ensure_prefix(
      dest.as_ref(),
      format!("{}/{}", dest.as_ref(), name.as_ref()),
    )?;
    tokio::fs::remove_file(dest_path).await?;
    Ok(())
  }

  pub async fn upload_static(
    &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
  ) -> Result<(), BucketError> {
    self.upload_file("static", name, stdin).await
  }

  pub async fn delete_static(&self, name: impl AsRef<str>) -> Result<(), BucketError> {
    self.delete_file("static", name).await
  }

  pub async fn upload_mapped(
    &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
  ) -> Result<(), BucketError> {
    self.upload_file("mapped", name, stdin).await
  }

  pub async fn delete_mapped(&self, name: impl AsRef<str>) -> Result<(), BucketError> {
    self.delete_file("mapped", name).await
  }

  pub async fn upload_checker(
    &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
  ) -> Result<(), BucketError> {
    self.upload_file("checker", name, stdin).await
  }

  pub async fn delete_checker(&self, name: impl AsRef<str>) -> Result<(), BucketError> {
    self.delete_file("checker", name).await
  }

  pub async fn upload_src(
    &self, name: impl AsRef<str>, stdin: impl AsyncRead + Send + Unpin,
  ) -> Result<(), BucketError> {
    self.upload_file("src", name, stdin).await
  }

  pub async fn delete_src(&self, name: impl AsRef<str>) -> Result<(), BucketError> {
    self.delete_file("src", name).await
  }

  pub async fn get_static_files(&self) -> Result<Vec<String>, BucketError> {
    let mut files = vec![];
    // challenges synced from a git repository may not carry the folder at all
    let mut dir = match read_dir(&self.path.join("static")).await {
      Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(files),
      other => other?,
    };
    while let Some(entry) = dir.next_entry().await? {
      let entry_file = entry.file_name().to_string_lossy().to_string();
      if entry_file.starts_with('.') {
        continue;
      }
      files.push(entry_file);
    }
    Ok(files)
  }

  pub async fn get_mapped_files(&self) -> Result<Vec<String>, BucketError> {
    let mut files = vec![];
    // challenges synced from a git repository may not carry the folder at all
    let mut dir = match read_dir(&self.path.join("mapped")).await {
      Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(files),
      other => other?,
    };
    while let Some(entry) = dir.next_entry().await? {
      let entry_file = entry.file_name().to_string_lossy().to_string();
      if entry_file.starts_with('.') {
        continue;
      }
      files.push(entry_file);
    }
    Ok(files)
  }

  pub async fn get_mapped_file(&self, requested_id: i64) -> Result<Option<String>, BucketError> {
    let mut files = self.get_mapped_files().await?;
    if files.is_empty() {
      return Ok(None);
    }
    files.sort();
    let file_index = requested_id as usize % files.len();
    Ok(Some(files[file_index].clone()))
  }

  pub async fn get_checker_files(&self) -> Result<Vec<String>, BucketError> {
    let mut files = vec![];
    // challenges synced from a git repository may not carry the folder at all
    let mut dir = match read_dir(&self.path.join("checker")).await {
      Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(files),
      other => other?,
    };
    while let Some(entry) = dir.next_entry().await? {
      let entry_file = entry.file_name().to_string_lossy().to_string();
      if entry_file.starts_with('.') {
        continue;
      }
      files.push(entry_file);
    }
    Ok(files)
  }

  pub async fn download_file(&self, path: impl AsRef<Path>) -> Result<File, BucketError> {
    debug!(file=?path.as_ref(), "downloading file from bucket");
    Ok(File::open(path).await?)
  }

  fn ensure_prefix(
    &self, sub_folder: impl AsRef<str>, file: impl AsRef<str>,
  ) -> Result<PathBuf, BucketError> {
    let sub_folder = self.path.join(sub_folder.as_ref()).canonicalize()?;
    let file_path = self.path.join(file.as_ref()).canonicalize()?;
    if !file_path.starts_with(sub_folder) {
      Err(BucketError::PathTraversal)
    } else {
      Ok(file_path)
    }
  }

  pub async fn download_static(&self, name: impl AsRef<str>) -> Result<File, BucketError> {
    debug!(file=?name.as_ref(), "downloading static file from bucket");
    self
      .download_file(&self.ensure_prefix("static", format!("static/{}", name.as_ref()))?)
      .await
  }

  pub async fn download_mapped(&self, name: impl AsRef<str>) -> Result<File, BucketError> {
    debug!(file=?name.as_ref(), "downloading mapped file from bucket");
    self
      .download_file(&self.ensure_prefix("mapped", format!("mapped/{}", name.as_ref()))?)
      .await
  }

  pub async fn download_checker(&self, name: impl AsRef<str>) -> Result<File, BucketError> {
    debug!(file=?name.as_ref(), "downloading checker file from bucket");
    self
      .download_file(&self.ensure_prefix("checker", format!("checker/{}", name.as_ref()))?)
      .await
  }

  pub fn hash(&self) -> String {
    let mut hasher = ring::digest::Context::new(&ring::digest::SHA256);
    hasher.update(self.path.to_string_lossy().as_bytes());
    hasher
      .finish()
      .as_ref()
      .iter()
      .fold(String::new(), |mut acc, b| {
        acc.push_str(&format!("{b:02x}"));
        acc
      })
    // .map(|b| format!("{:02x}", b))
    // .collect::<String>()
  }
}

fn to_file_name(file: &str) -> String {
  let file = deunicode_with_tofu(file, "_").trim().to_owned();
  let escape_filesystem = Regex::new(r#"[\\\/:\*\?\"<>\|\ ]"#).unwrap();
  let escape_printable = Regex::new(r#"[^[:print:]]"#).unwrap();
  let file = escape_filesystem.replace_all(&file, "_").to_string();
  let file = file.trim_matches('_').to_lowercase().to_owned();
  escape_printable.replace_all(&file, "").to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn challenge_config_round_trips_avatar_and_prerequisites() {
    let config = ChallengeConfig {
      name: "test".to_owned(),
      tag: TagList(vec![]),
      score_rule: ScoreRule {
        initial: 1000,
        minimum: 100,
        decay: 10,
      },
      avatar: Some("avatar-hash".to_owned()),
      prerequisites: vec!["web_1700000000".to_owned()],
    };
    let value = serde_json::to_value(&config).unwrap();
    let parsed: ChallengeConfig = serde_json::from_value(value).unwrap();
    assert_eq!(parsed.avatar.as_deref(), Some("avatar-hash"));
    assert_eq!(parsed.prerequisites, vec!["web_1700000000".to_owned()]);
  }

  #[test]
  fn challenge_config_tolerates_legacy_files_without_new_fields() {
    let value = serde_json::json!({
      "name": "legacy",
      "tag": [],
      "score_rule": {"initial": 1000, "minimum": 100, "decay": 10}
    });
    let parsed: ChallengeConfig = serde_json::from_value(value).unwrap();
    assert_eq!(parsed.avatar, None);
    assert!(parsed.prerequisites.is_empty());
  }

  fn test_bucket() -> ChallengeBucket {
    let root = std::env::temp_dir().join(format!(
      "r2s-challenge-bucket-test-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    std::fs::create_dir_all(root.join("static")).unwrap();
    std::fs::write(root.join("static").join("ok.txt"), "ok").unwrap();
    std::fs::write(root.join("secret.txt"), "secret").unwrap();
    ChallengeBucket {
      name: "test".to_owned(),
      path: root,
      locked: true,
    }
  }

  #[test]
  fn test_to_file_name() {
    assert_eq!(to_file_name("hello world"), "hello_world");
    assert_eq!(to_file_name("hello:world"), "hello_world");
    assert_eq!(to_file_name("hello/world"), "hello_world");
    assert_eq!(to_file_name("hello*world"), "hello_world");
    assert_eq!(to_file_name("hello?world"), "hello_world");
    assert_eq!(to_file_name("hello\"world"), "hello_world");
    assert_eq!(to_file_name("hello<world"), "hello_world");
    assert_eq!(to_file_name("hello>world"), "hello_world");
    assert_eq!(to_file_name("hello|world"), "hello_world");
    assert_eq!(to_file_name("hello world\n"), "hello_world");
    assert_eq!(to_file_name("hello world\t"), "hello_world");
    assert_eq!(to_file_name("hello world\r"), "hello_world");
    assert_eq!(to_file_name("hello world\x7f"), "hello_world");
    assert_eq!(to_file_name("hello world.zip"), "hello_world.zip");
  }

  #[test]
  fn ensure_prefix_rejects_path_traversal() {
    let bucket = test_bucket();
    assert!(bucket.ensure_prefix("static", "static/ok.txt").is_ok());
    assert!(matches!(
      bucket.ensure_prefix("static", "static/../secret.txt"),
      Err(BucketError::PathTraversal)
    ));
    std::fs::remove_dir_all(bucket.path).ok();
  }
}

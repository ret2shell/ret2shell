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
    let mut dir = read_dir(&self.path.join("static")).await?;
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
    let mut dir = read_dir(&self.path.join("mapped")).await?;
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
    let mut dir = read_dir(&self.path.join("checker")).await?;
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

  fn challenge_config(name: &str) -> ChallengeConfig {
    ChallengeConfig {
      name: name.to_owned(),
      tag: TagList(vec![Tag {
        name: "pwn".to_owned(),
        primary: true,
      }]),
      score_rule: ScoreRule {
        initial: 1000,
        minimum: 100,
        decay: 20,
      },
    }
  }

  fn temp_root(label: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    std::env::temp_dir().join(format!(
      "r2s-challenge-test-{label}-{}-{nanos}",
      std::process::id()
    ))
  }

  #[tokio::test]
  async fn new_creates_layout_and_open_rejects_missing_or_conflicting_paths() {
    let root = temp_root("layout");

    std::fs::create_dir_all(&root).unwrap();
    let bucket = ChallengeBucket::new(&root, "hello_world", challenge_config("Hello World"))
      .await
      .unwrap();

    for entry in ["config.toml", "mapped", "checker", "src", "static"] {
      assert!(bucket.path.join(entry).exists(), "missing {entry}");
    }
    let saved: ChallengeConfig = toml::from_str(
      &tokio::fs::read_to_string(bucket.path.join("config.toml"))
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(saved.name, "Hello World");

    // opening a missing bucket fails with the full path in the error.
    let err = ChallengeBucket::open(&root, "no_such", true)
      .await
      .unwrap_err();
    assert!(matches!(err, BucketError::PathDoesNotExist(path) if path.ends_with("no_such")));

    // creating over an existing path conflicts.
    let err = ChallengeBucket::new(&root, "hello_world", challenge_config("again"))
      .await
      .unwrap_err();
    assert!(matches!(err, BucketError::PathConflict(_)));

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn config_env_hints_round_trip_with_defaults() {
    let root = temp_root("round-trip");
    std::fs::create_dir_all(&root).unwrap();
    let bucket = ChallengeBucket::new(&root, "demo", challenge_config("Demo"))
      .await
      .unwrap();

    // config round-trips through set_config.
    let updated = challenge_config("Renamed");
    bucket
      .set_config(serde_json::to_value(&updated).unwrap())
      .await
      .unwrap();
    assert_eq!(bucket.config().await.unwrap().name, "Renamed");

    // env is optional and round-trips; delete removes it again.
    assert!(bucket.env().await.unwrap().is_none());
    let env_json = serde_json::json!({
      "internet": true,
      "images": [{ "name": "web", "tag": "latest", "cpu": 1.0, "mem": "512Mi" }],
    });
    bucket.set_env(env_json).await.unwrap();
    let env = bucket.env().await.unwrap().unwrap();
    assert!(env.internet);
    assert_eq!(env.images[0].name, "web");
    bucket.delete_env().await.unwrap();
    assert!(bucket.env().await.unwrap().is_none());

    // hints default to empty and round-trip.
    assert!(bucket.hints().await.unwrap().hints.is_empty());
    bucket
      .set_hints(Hints {
        hints: vec![Hint {
          content: "look at the binary".to_owned(),
          cost: 50,
        }],
      })
      .await
      .unwrap();
    let hints = bucket.hints().await.unwrap();
    assert_eq!(hints.hints.len(), 1);
    assert_eq!(hints.hints[0].cost, 50);

    // text documents default to empty content when never written.
    assert_eq!(bucket.description().await.unwrap(), "");
    assert_eq!(bucket.answer().await.unwrap(), "");
    assert_eq!(bucket.checker().await.unwrap(), "");
    bucket.set_description("# demo".to_owned()).await.unwrap();
    bucket.set_answer("flag{demo}".to_owned()).await.unwrap();
    bucket
      .set_checker("pub fn check() {}".to_owned())
      .await
      .unwrap();
    assert_eq!(bucket.description().await.unwrap(), "# demo");
    assert_eq!(bucket.answer().await.unwrap(), "flag{demo}");
    assert_eq!(bucket.checker().await.unwrap(), "pub fn check() {}");

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn write_operations_require_locking() {
    let root = temp_root("locked");
    std::fs::create_dir_all(&root).unwrap();
    let bucket = ChallengeBucket::new(&root, "locked_demo", challenge_config("Locked"))
      .await
      .unwrap();

    let unlocked = ChallengeBucket::open(&root, "locked_demo", false)
      .await
      .unwrap();
    assert!(!unlocked.locked);

    let config_json = serde_json::to_value(challenge_config("x")).unwrap();
    let env_json = serde_json::json!({ "internet": false, "images": [] });
    assert!(matches!(
      unlocked.set_config(config_json.clone()).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.set_env(env_json.clone()).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.delete_env().await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.set_hints(Hints { hints: vec![] }).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.set_description("d".to_owned()).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.set_answer("a".to_owned()).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.set_checker("c".to_owned()).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.upload_static("f.txt", "data".as_bytes()).await,
      Err(BucketError::NeedLocking)
    ));
    assert!(matches!(
      unlocked.delete_static("ok.txt").await,
      Err(BucketError::NeedLocking)
    ));

    // the locked handle can perform the same operations.
    bucket.set_config(config_json).await.unwrap();
    bucket.set_env(env_json).await.unwrap();

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn file_listing_upload_and_delete_normalize_names_and_skip_dotfiles() {
    let root = temp_root("files");
    std::fs::create_dir_all(&root).unwrap();
    let bucket = ChallengeBucket::new(&root, "file_demo", challenge_config("Files"))
      .await
      .unwrap();

    bucket
      .upload_static("attachment file.zip", "data".as_bytes())
      .await
      .unwrap();
    bucket
      .upload_static(".hidden", "secret".as_bytes())
      .await
      .unwrap();
    bucket
      .upload_mapped("mapped.bin", "m".as_bytes())
      .await
      .unwrap();
    bucket
      .upload_checker("main.rx", "script".as_bytes())
      .await
      .unwrap();
    bucket
      .upload_src("pwn.c", "int main(){}".as_bytes())
      .await
      .unwrap();

    // uploaded names are sanitized to filesystem-safe identifiers.
    assert_eq!(
      bucket.get_static_files().await.unwrap(),
      vec!["attachment_file.zip"]
    );
    assert_eq!(bucket.get_mapped_files().await.unwrap(), vec!["mapped.bin"]);
    assert_eq!(bucket.get_checker_files().await.unwrap(), vec!["main.rx"]);

    // downloads are restricted to the requested subfolder.
    let mut static_content = String::new();
    tokio::io::AsyncReadExt::read_to_string(
      &mut bucket.download_static("attachment_file.zip").await.unwrap(),
      &mut static_content,
    )
    .await
    .unwrap();
    assert_eq!(static_content, "data");

    // an existing sibling file is unreachable through a relative escape.
    std::fs::write(bucket.path.join("outside.txt"), "secret").unwrap();
    let err = bucket.download_static("../outside.txt").await.unwrap_err();
    assert!(matches!(err, BucketError::PathTraversal));

    bucket.delete_static("attachment_file.zip").await.unwrap();
    assert!(bucket.get_static_files().await.unwrap().is_empty());

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn get_mapped_file_is_none_when_empty_and_rotates_by_requested_id() {
    let root = temp_root("mapped-rotation");
    std::fs::create_dir_all(&root).unwrap();
    let bucket = ChallengeBucket::new(&root, "rot_demo", challenge_config("Rot"))
      .await
      .unwrap();

    assert!(bucket.get_mapped_file(1).await.unwrap().is_none());

    for name in ["b.bin", "a.bin"] {
      bucket.upload_mapped(name, "x".as_bytes()).await.unwrap();
    }

    // files are sorted before indexing so rotation order is deterministic.
    assert_eq!(
      bucket.get_mapped_file(0).await.unwrap().as_deref(),
      Some("a.bin")
    );
    assert_eq!(
      bucket.get_mapped_file(1).await.unwrap().as_deref(),
      Some("b.bin")
    );
    assert_eq!(
      bucket.get_mapped_file(2).await.unwrap().as_deref(),
      Some("a.bin")
    );

    std::fs::remove_dir_all(root).ok();
  }

  #[test]
  fn hash_is_deterministic_for_the_same_path() {
    let bucket = test_bucket();
    assert_eq!(bucket.hash(), bucket.hash());
    assert_eq!(bucket.hash().len(), 64);
    std::fs::remove_dir_all(bucket.path).ok();
  }
}

use std::{
  ffi::OsStr,
  path::{Path, PathBuf},
  process::{Command as SyncCommand, Stdio},
};

use serde::{Deserialize, Serialize};
use tokio::{
  fs::create_dir_all,
  io::AsyncRead,
  process::{ChildStdout, Command},
};
use tracing::{debug, trace, warn};

use crate::BucketError;

#[derive(Clone, Debug)]
pub struct Git {
  path: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CommitAuthor {
  name: String,
  email: String,
  date: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CommitLog {
  abbreviated_commit: String,
  subject: String,
  body: String,
  author: CommitAuthor,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ObjectInfo {
  path: String,
  commit: String,
  r#type: String, // "blob" or "tree" or "commit"
  last_modified: Option<i64>,
  subject: Option<String>,
  author: Option<String>,
}

impl Git {
  pub async fn try_open(path: impl AsRef<Path>) -> Result<Self, BucketError> {
    let path = path.as_ref();
    if path.exists() {
      trace!(?path, "opening git repository");
    } else {
      warn!(?path, "git repository does not exist");
      return Err(BucketError::PathDoesNotExist(path.display().to_string()));
    }
    let output = Command::new("git")
      .current_dir(path)
      .arg("describe")
      .arg("--all")
      .arg("--long")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "opened git repository");
      Ok(Self {
        path: path.to_path_buf().canonicalize()?,
      })
    } else {
      warn!(stdio=?output, "failed to open git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn new(path: impl AsRef<Path>) -> Result<Self, BucketError> {
    let path = path.as_ref();
    if path.exists() {
      warn!(?path, "folder already exists");
      return Err(BucketError::PathConflict(path.display().to_string()));
    }
    create_dir_all(&path).await?;
    Self::init(&path).await
  }

  async fn init(path: impl AsRef<Path>) -> Result<Self, BucketError> {
    let path = path.as_ref();
    if path.exists() {
      trace!(?path, "opening git repository");
    } else {
      warn!(?path, "git repository does not exist");
      return Err(BucketError::PathDoesNotExist(path.display().to_string()));
    }
    let output = Command::new("git")
      .current_dir(path)
      .arg("init")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "initialized git repository");
      Ok(Self {
        path: path.to_path_buf().canonicalize()?,
      })
    } else {
      warn!(stdio=?output, "failed to initialize git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn add_all(&self) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("add")
      .arg("--all")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "added all files to git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to add all files to git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn commit(
    &self, message: impl AsRef<str>, author: impl AsRef<str>, email: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("status")
      .arg("-u")
      .arg("--porcelain")
      .output()
      .await?;
    let git_status = String::from_utf8(output.stdout)?;
    if git_status.trim().is_empty() {
      return Ok(());
    }
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("commit")
      .arg("--no-gpg-sign")
      .arg("--author")
      .arg(format!("{} <{}>", author.as_ref(), email.as_ref()))
      .arg("-m")
      .arg(message.as_ref())
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "committed to git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to commit to git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stdout,
      )?))
    }
  }

  pub async fn take_shot(
    &self, message: impl AsRef<str>, author: impl AsRef<str>, email: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    self.add_all().await?;
    self.commit(message, author, email).await
  }

  pub async fn checkout_head(&self) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("checkout")
      .arg("HEAD")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "checked out HEAD in git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to checkout HEAD in git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn checkout(&self, branch: impl AsRef<str>) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("checkout")
      .arg(branch.as_ref())
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "checked out branch in git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to checkout branch in git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn cleanup(&self) -> Result<(), BucketError> {
    self.reset_head_internal().await?;
    self.clean_untracked().await
  }

  pub fn cleanup_sync(&self) -> Result<(), BucketError> {
    self.reset_head_internal_sync()?;
    self.clean_untracked_sync()
  }

  async fn reset_head_internal(&self) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("reset")
      .arg("--hard")
      .arg("HEAD")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "reset HEAD in git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to reset HEAD in git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  fn reset_head_internal_sync(&self) -> Result<(), BucketError> {
    let output = SyncCommand::new("git")
      .current_dir(&self.path)
      .arg("reset")
      .arg("--hard")
      .arg("HEAD")
      .output()?;
    if output.status.success() {
      trace!(stdio=?output, "reset HEAD in git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to reset HEAD in git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  async fn clean_untracked(&self) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("clean")
      .arg("-fd")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "cleaned up git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to clean up git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  fn clean_untracked_sync(&self) -> Result<(), BucketError> {
    let output = SyncCommand::new("git")
      .current_dir(&self.path)
      .arg("clean")
      .arg("-fd")
      .output()?;
    if output.status.success() {
      trace!(stdio=?output, "cleaned up git repository");
      Ok(())
    } else {
      warn!(stdio=?output, "failed to clean up git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn logs(&self, sub_path: impl AsRef<str>) -> Result<Vec<CommitLog>, BucketError> {
    let sub_path = self.path.join(sub_path.as_ref()).canonicalize()?;
    // check path traversal
    if !sub_path.starts_with(&self.path) && sub_path != self.path {
      return Err(BucketError::PathTraversal);
    }
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("log")
      .arg("--date=unix")
      .arg("--pretty=format:{\"abbreviated_commit\":\"%h\",\"subject\":\"%s\",\"body\":\"%b\",\"author\":{\"name\":\"%aN\",\"email\":\"%aE\",\"date\":%at}}")
      .arg(&sub_path)
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "got commits from git repository");
      let output = String::from_utf8(output.stdout)?;
      Ok(
        output
          .lines()
          .map(serde_json::from_str)
          .filter_map(Result::ok)
          .collect(),
      )
    } else {
      warn!(stdio=?output, "failed to get commits from git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  /// List all objects in the git repository
  pub async fn list_objects(
    &self, sub_path: impl AsRef<str>,
  ) -> Result<Vec<ObjectInfo>, BucketError> {
    let sub_path = self.path.join(sub_path.as_ref()).canonicalize()?;
    // check path traversal
    if !sub_path.starts_with(&self.path) && sub_path != self.path {
      return Err(BucketError::PathTraversal);
    }
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("ls-tree")
      .arg(
        "--format={\"type\":\"%(objecttype)\",\"path\":\"%(path)\",\"commit\":\"%(objectname)\"}",
      )
      .arg("HEAD")
      .arg(format!("{}/", sub_path.to_str().unwrap_or(".")))
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "got objects from git repository");
      let output = String::from_utf8(output.stdout)?;
      let mut result: Vec<ObjectInfo> = output
        .lines()
        .map(serde_json::from_str)
        .filter_map(Result::ok)
        .collect();

      // get each object info
      for obj in result.iter_mut() {
        let output = Command::new("git")
          .current_dir(&self.path)
          .arg("log")
          .arg("--format={\"abbreviated_commit\":\"%h\",\"subject\":\"%s\",\"body\":\"%b\",\"author\":{\"name\":\"%aN\",\"email\":\"%aE\",\"date\":%at}}")
          .arg("--date=unix")
          .arg(format!("--find-object={}", obj.commit)).output().await?;

        if output.status.success() {
          trace!(stdio=?output, "got object info from git repository");
          let output = String::from_utf8(output.stdout)?;
          let obj_info: CommitLog = serde_json::from_str(output.lines().next().ok_or(
            BucketError::GitCommandFailed("failed to parse object info".to_string()),
          )?)?;
          obj.commit = obj_info.abbreviated_commit;
          obj.subject = Some(obj_info.subject);
          obj.author = Some(obj_info.author.name);
          obj.last_modified = Some(obj_info.author.date);
        } else {
          warn!(
            stdio=?output,
            "failed to get object info from git repository",
          );
          return Err(BucketError::GitCommandFailed(String::from_utf8(
            output.stderr,
          )?));
        }
      }

      Ok(result)
    } else {
      warn!(stdio=?output, "failed to get objects from git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn get_head(&self) -> Result<String, BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("rev-parse")
      .arg("HEAD")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output,"got HEAD from git repository");
      Ok(String::from_utf8(output.stdout)?.trim().to_string())
    } else {
      warn!(stdio=?output, "failed to get HEAD from git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  async fn stream_internal<T, S>(
    &self, protocol: impl AsRef<OsStr>, subcmd: impl AsRef<OsStr>, args: T,
    mut stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError>
  where
    T: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
  {
    let mut cmd = Command::new("git");
    cmd
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .env("GIT_PROTOCOL", protocol)
      .arg(subcmd.as_ref())
      .args(args)
      .arg(self.path.as_os_str());
    debug!(?cmd, "run command for git repo stream internal rpc");
    let mut child = cmd.spawn()?;
    let stdout_fd = child.stdout.take().unwrap();
    let mut stdin_fd = child.stdin.take().unwrap();
    tokio::spawn(async move {
      tokio::io::copy(&mut stdin, &mut stdin_fd).await.unwrap();
    });
    Ok(stdout_fd)
  }

  pub async fn info_refs_receive(
    &self, protocol: impl AsRef<OsStr>, stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError> {
    self
      .stream_internal(
        protocol,
        "receive-pack",
        ["--stateless-rpc", "--advertise-refs"],
        stdin,
      )
      .await
  }

  pub async fn info_refs_upload(
    &self, protocol: impl AsRef<OsStr>, stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError> {
    debug!(path = ?self.path, "get info refs for repo");
    self
      .stream_internal(
        protocol,
        "upload-pack",
        ["--stateless-rpc", "--advertise-refs"],
        stdin,
      )
      .await
  }

  pub async fn upload_pack(
    &self, protocol: impl AsRef<OsStr>, stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError> {
    self
      .stream_internal(protocol, "upload-pack", ["--stateless-rpc"], stdin)
      .await
  }

  pub async fn receive_pack(
    &self, protocol: impl AsRef<OsStr>, stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError> {
    self
      .stream_internal(protocol, "receive-pack", ["--stateless-rpc"], stdin)
      .await
  }
}

// covert a message to PKT-LINE format
/// Converts a message to the PKT-LINE format used in Git's protocol.
///
/// This function takes a message as input and returns a string in the PKT-LINE
/// format, which is used in Git's protocol for communication between the client
/// and server.
///
/// # Arguments
///
/// * `msg` - A reference to the message that needs to be converted to PKT-LINE
///   format.
///
/// # Returns
///
/// * `String` - The message converted to PKT-LINE format.
///
/// # Examples
///
/// ```
/// let message = "Hello, world!";
/// let pkt_line = to_pkt_line(message);
/// ```
pub fn to_pkt_line(msg: impl AsRef<str>) -> String {
  format!("{:04x}{}", msg.as_ref().len() + 4, msg.as_ref())
}

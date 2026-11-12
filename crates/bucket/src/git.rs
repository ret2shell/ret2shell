use std::{
  collections::HashMap,
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

const GIT_LOG_RECORD_SEPARATOR: u8 = 0x1E;
const GIT_LOG_FIELD_SEPARATOR: u8 = 0x1F;
const REPO_ROOT_PATH: &str = ".";

/// Ref that incremental instance synchronization fetches into. Fetching only
/// ever updates this ref: the checked-out branch and the working tree stay
/// untouched until the caller has validated the fast-forward relationship
/// and resets explicitly.
pub const SYNC_CANDIDATE_REF: &str = "refs/ret2shell-sync/candidate";

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

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RepoPathIndex {
  entries: HashMap<String, Vec<ObjectInfo>>,
}

impl RepoPathIndex {
  pub fn list(&self, path: &str) -> Vec<ObjectInfo> {
    self
      .entries
      .get(repo_index_path(path))
      .cloned()
      .unwrap_or_default()
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiffEntry {
  pub status: String,
  pub old_path: Option<String>,
  pub path: String,
}

#[derive(Clone, Debug)]
struct ObjectCommitInfo {
  abbreviated_commit: String,
  subject: String,
  author: String,
  date: i64,
}

fn parse_ls_tree_record(record: &[u8]) -> Result<ObjectInfo, BucketError> {
  let header_end = record
    .iter()
    .position(|byte| *byte == b'\t')
    .ok_or_else(|| {
      BucketError::GitCommandFailed("failed to parse ls-tree object path".to_string())
    })?;
  let header = &record[..header_end];
  let object_path = &record[header_end + 1..];
  if object_path.is_empty() {
    return Err(BucketError::GitCommandFailed(
      "failed to parse ls-tree object path".to_string(),
    ));
  }

  let mut header_fields = header.split(|byte| *byte == b' ');
  header_fields.next().ok_or_else(|| {
    BucketError::GitCommandFailed("failed to parse ls-tree object mode".to_string())
  })?;
  let object_type = header_fields.next().ok_or_else(|| {
    BucketError::GitCommandFailed("failed to parse ls-tree object type".to_string())
  })?;
  let object_id = header_fields.next().ok_or_else(|| {
    BucketError::GitCommandFailed("failed to parse ls-tree object id".to_string())
  })?;

  Ok(ObjectInfo {
    path: String::from_utf8(object_path.to_vec())?,
    commit: String::from_utf8(object_id.to_vec())?,
    r#type: String::from_utf8(object_type.to_vec())?,
    last_modified: None,
    subject: None,
    author: None,
  })
}

fn parse_ls_tree_objects(output: &[u8]) -> Result<Vec<ObjectInfo>, BucketError> {
  output
    .split(|byte| *byte == 0)
    .filter(|record| !record.is_empty())
    .map(parse_ls_tree_record)
    .collect()
}

fn parse_git_path(path: &Path) -> String {
  path.to_string_lossy().replace('\\', "/")
}

fn repo_index_path(path: &str) -> &str {
  if path.is_empty() {
    REPO_ROOT_PATH
  } else {
    path
  }
}

fn repo_relative_path(repo_root: &Path, path: &Path) -> Result<String, BucketError> {
  if path == repo_root {
    return Ok(String::new());
  }

  let relative = path
    .strip_prefix(repo_root)
    .map_err(|_| BucketError::PathTraversal)?;
  Ok(parse_git_path(relative))
}

fn entry_paths_for_changed_path(changed_path: &str) -> Vec<String> {
  let mut current = String::new();
  let mut entries = Vec::new();

  for segment in changed_path
    .split('/')
    .filter(|segment| !segment.is_empty())
  {
    if !current.is_empty() {
      current.push('/');
    }
    current.push_str(segment);
    entries.push(current.clone());
  }

  entries
}

fn group_objects_by_parent_path(objects: Vec<ObjectInfo>) -> RepoPathIndex {
  let mut entries = HashMap::new();
  entries
    .entry(REPO_ROOT_PATH.to_owned())
    .or_insert_with(Vec::new);

  for object in objects {
    let parent = object
      .path
      .rsplit_once('/')
      .map(|(parent, _)| parent)
      .unwrap_or(REPO_ROOT_PATH)
      .to_owned();
    entries.entry(parent).or_insert_with(Vec::new).push(object);
  }

  RepoPathIndex { entries }
}

fn listed_entry_for_changed_path(base_path: &str, changed_path: &str) -> Option<String> {
  let relative_path = if base_path.is_empty() {
    changed_path
  } else {
    let suffix = changed_path.strip_prefix(base_path)?;
    suffix.strip_prefix('/')?
  };

  let child = relative_path.split('/').next()?;
  if child.is_empty() {
    return None;
  }

  if base_path.is_empty() {
    Some(child.to_string())
  } else {
    Some(format!("{base_path}/{child}"))
  }
}

fn parse_commit_record(record: &[u8]) -> Result<(ObjectCommitInfo, &[u8]), BucketError> {
  let Some(header_end) = record.iter().position(|byte| *byte == 0) else {
    return Err(BucketError::GitCommandFailed(
      "failed to parse git log record header".to_string(),
    ));
  };
  let header = &record[..header_end];
  let mut body = &record[header_end + 1..];
  if body.first() == Some(&b'\n') {
    body = &body[1..];
  }

  let mut header_fields = header.split(|byte| *byte == GIT_LOG_FIELD_SEPARATOR);
  let abbreviated_commit = header_fields.next().ok_or_else(|| {
    BucketError::GitCommandFailed("failed to parse git log abbreviated commit".to_string())
  })?;
  let subject = header_fields
    .next()
    .ok_or_else(|| BucketError::GitCommandFailed("failed to parse git log subject".to_string()))?;
  let author = header_fields
    .next()
    .ok_or_else(|| BucketError::GitCommandFailed("failed to parse git log author".to_string()))?;
  let date = header_fields
    .next()
    .ok_or_else(|| BucketError::GitCommandFailed("failed to parse git log date".to_string()))?;

  Ok((
    ObjectCommitInfo {
      abbreviated_commit: String::from_utf8(abbreviated_commit.to_vec())?,
      subject: String::from_utf8(subject.to_vec())?,
      author: String::from_utf8(author.to_vec())?,
      date: String::from_utf8(date.to_vec())?.parse().map_err(|err| {
        BucketError::GitCommandFailed(format!("failed to parse git log date: {err}"))
      })?,
    },
    body,
  ))
}

fn populate_object_commits(
  base_path: &str, output: &[u8], objects: &mut [ObjectInfo],
) -> Result<(), BucketError> {
  let path_to_index: HashMap<_, _> = objects
    .iter()
    .enumerate()
    .map(|(index, object)| (object.path.clone(), index))
    .collect();
  let mut remaining = objects.len();

  for record in output.split(|byte| *byte == GIT_LOG_RECORD_SEPARATOR) {
    if record.is_empty() {
      continue;
    }

    let (commit, body) = parse_commit_record(record)?;
    for changed_path in body
      .split(|byte| *byte == 0)
      .filter(|path| !path.is_empty())
    {
      let changed_path = String::from_utf8(changed_path.to_vec())?;
      let Some(entry_path) = listed_entry_for_changed_path(base_path, &changed_path) else {
        continue;
      };
      let Some(index) = path_to_index.get(&entry_path).copied() else {
        continue;
      };
      let object = &mut objects[index];
      if object.subject.is_some() {
        continue;
      }

      object.commit = commit.abbreviated_commit.clone();
      object.subject = Some(commit.subject.clone());
      object.author = Some(commit.author.clone());
      object.last_modified = Some(commit.date);
      remaining -= 1;
      if remaining == 0 {
        return Ok(());
      }
    }
  }

  if remaining == 0 {
    Ok(())
  } else {
    Err(BucketError::GitCommandFailed(format!(
      "failed to resolve last commit for {remaining} object(s)"
    )))
  }
}

fn populate_path_index_commits(
  output: &[u8], objects: &mut [ObjectInfo],
) -> Result<(), BucketError> {
  let path_to_index: HashMap<_, _> = objects
    .iter()
    .enumerate()
    .map(|(index, object)| (object.path.clone(), index))
    .collect();
  let mut remaining = objects.len();

  for record in output.split(|byte| *byte == GIT_LOG_RECORD_SEPARATOR) {
    if record.is_empty() {
      continue;
    }

    let (commit, body) = parse_commit_record(record)?;
    for changed_path in body
      .split(|byte| *byte == 0)
      .filter(|path| !path.is_empty())
    {
      let changed_path = String::from_utf8(changed_path.to_vec())?;
      for entry_path in entry_paths_for_changed_path(&changed_path) {
        let Some(index) = path_to_index.get(&entry_path).copied() else {
          continue;
        };
        let object = &mut objects[index];
        if object.subject.is_some() {
          continue;
        }

        object.commit = commit.abbreviated_commit.clone();
        object.subject = Some(commit.subject.clone());
        object.author = Some(commit.author.clone());
        object.last_modified = Some(commit.date);
        remaining -= 1;
        if remaining == 0 {
          return Ok(());
        }
      }
    }
  }

  if remaining == 0 {
    Ok(())
  } else {
    Err(BucketError::GitCommandFailed(format!(
      "failed to resolve last commit for {remaining} object(s)"
    )))
  }
}

/// Hardening shared by every remote Git transfer (`clone` and `fetch`): no
/// terminal prompts, no system config, http(s) as the only production
/// transport, no redirect following, protected path components, fscked
/// objects and no hooks. `allow_file` additionally permits the local
/// `file://` transport and exists only for tests driving real repositories
/// on disk.
struct RemoteGitTransfer {
  hooks_path: PathBuf,
}

impl RemoteGitTransfer {
  async fn new() -> Result<Self, BucketError> {
    let hooks_path = std::env::temp_dir().join(format!(
      "ret2shell-sync-hooks-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
    ));
    create_dir_all(&hooks_path).await?;
    Ok(Self { hooks_path })
  }

  fn command(&self, allow_file: bool) -> Command {
    let mut command = Command::new("git");
    command.kill_on_drop(true);
    command
      .env("GIT_TERMINAL_PROMPT", "0")
      .env("GIT_CONFIG_NOSYSTEM", "1")
      .arg("-c")
      .arg(if allow_file {
        "protocol.file.allow=always"
      } else {
        "protocol.file.allow=never"
      })
      .arg("-c")
      .arg("protocol.ssh.allow=never")
      .arg("-c")
      .arg("protocol.ext.allow=never")
      .arg("-c")
      .arg("http.followRedirects=false")
      .arg("-c")
      .arg("core.protectNTFS=true")
      .arg("-c")
      .arg("core.protectHFS=true")
      .arg("-c")
      .arg("transfer.fsckObjects=true")
      .arg("-c")
      .arg(format!("core.hooksPath={}", self.hooks_path.display()));
    command
  }

  /// Credentials travel through the environment instead of argv so they
  /// never show up in process listings or command logs.
  fn apply_bearer_token(command: &mut Command, bearer_token: Option<&str>) {
    if let Some(token) = bearer_token {
      command
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "http.extraHeader")
        .env(
          "GIT_CONFIG_VALUE_0",
          format!("Authorization: Bearer {token}"),
        );
    }
  }

  async fn cleanup(self) {
    tokio::fs::remove_dir_all(&self.hooks_path).await.ok();
  }
}

/// Branch names are embedded into a fetch refspec, so they must satisfy the
/// git reference format before they reach the command line: a branch like
/// `--upload-pack=...` must never be interpreted as a git option.
fn validate_sync_branch(branch: &str) -> Result<(), BucketError> {
  const MAX_BRANCH_LENGTH: usize = 255;
  let invalid = branch.is_empty()
    || branch.len() > MAX_BRANCH_LENGTH
    || branch.starts_with(['.', '-', '/'])
    || branch.ends_with(['.', '/'])
    || branch.ends_with(".lock")
    || branch == "@"
    || branch.contains("..")
    || branch.contains("@{")
    || branch.contains('\\')
    || branch.chars().any(|c| {
      matches!(
        c,
        ' ' | '~' | '^' | ':' | '?' | '[' | '*' | '\0'..='\x1f' | '\x7f'
      )
    })
    || branch
      .split('/')
      .any(|part| part.is_empty() || part.starts_with('.') || part == "@");
  if invalid {
    return Err(BucketError::GitCommandFailed(format!(
      "invalid branch name for instance synchronization: {branch}"
    )));
  }
  Ok(())
}

impl Git {
  pub fn path(&self) -> &Path {
    &self.path
  }

  pub async fn try_open(path: impl AsRef<Path>) -> Result<Self, BucketError> {
    let path = path.as_ref();
    if !path.exists() {
      warn!(?path, "git repository does not exist");
      return Err(BucketError::PathDoesNotExist(path.display().to_string()));
    }
    // Validate the repository with cheap filesystem lookups instead of
    // shelling out to `git`: this runs on every bucket open, including every
    // read-only request, and spawning a subprocess per request exhausts the
    // file descriptor limit under load. Buckets are always regular
    // repositories created by `git init`, so the core layout under `.git` is
    // enough; worktree `gitdir` indirection is not supported.
    let git_dir = path.join(".git");
    if !git_dir.join("HEAD").exists()
      || !git_dir.join("objects").exists()
      || !git_dir.join("refs").exists()
    {
      warn!(?path, "path is not a git repository");
      return Err(BucketError::GitCommandFailed(format!(
        "{} is not a git repository",
        path.display()
      )));
    }
    trace!(?path, "opening git repository");
    Ok(Self {
      path: path.to_path_buf().canonicalize()?,
    })
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

  pub async fn clone(
    repository_url: impl AsRef<str>, destination: impl AsRef<Path>, bearer_token: Option<&str>,
  ) -> Result<Self, BucketError> {
    Self::clone_with_file_policy(repository_url, destination, bearer_token, false).await
  }

  #[cfg(test)]
  pub(crate) async fn clone_for_test(
    repository_url: impl AsRef<str>, destination: impl AsRef<Path>, bearer_token: Option<&str>,
  ) -> Result<Self, BucketError> {
    Self::clone_with_file_policy(repository_url, destination, bearer_token, true).await
  }

  async fn clone_with_file_policy(
    repository_url: impl AsRef<str>, destination: impl AsRef<Path>, bearer_token: Option<&str>,
    allow_file: bool,
  ) -> Result<Self, BucketError> {
    let repository_url = repository_url.as_ref();
    let destination = destination.as_ref();
    if destination.exists() {
      return Err(BucketError::PathConflict(destination.display().to_string()));
    }
    let transfer = RemoteGitTransfer::new().await?;
    let mut command = transfer.command(allow_file);
    command
      .arg("clone")
      .arg("--no-hardlinks")
      .arg("--no-checkout")
      .arg("--")
      .arg(repository_url)
      .arg(destination);
    RemoteGitTransfer::apply_bearer_token(&mut command, bearer_token);
    let output = command.output().await;
    transfer.cleanup().await;
    let output = output?;
    if !output.status.success() {
      return Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?));
    }
    let result = async {
      let git = Self::try_open(&destination).await?;
      git.reset_hard("HEAD").await?;
      git.validate_sync_tree("HEAD").await?;
      Ok(git)
    }
    .await;
    if result.is_err() {
      tokio::fs::remove_dir_all(&destination).await.ok();
    }
    result
  }

  /// Fetches a branch from a source instance into [`SYNC_CANDIDATE_REF`].
  /// The refspec is forced so an upstream history rewrite still updates the
  /// candidate; whether the update is a fast-forward is decided separately
  /// by [`Git::is_ancestor`] against the local HEAD. The current branch and
  /// the working tree are never touched.
  pub async fn fetch(
    &self, repository_url: impl AsRef<str>, branch: impl AsRef<str>, bearer_token: Option<&str>,
  ) -> Result<(), BucketError> {
    self
      .fetch_with_file_policy(repository_url, branch, bearer_token, false)
      .await
  }

  #[cfg(test)]
  pub(crate) async fn fetch_for_test(
    &self, repository_url: impl AsRef<str>, branch: impl AsRef<str>, bearer_token: Option<&str>,
  ) -> Result<(), BucketError> {
    self
      .fetch_with_file_policy(repository_url, branch, bearer_token, true)
      .await
  }

  async fn fetch_with_file_policy(
    &self, repository_url: impl AsRef<str>, branch: impl AsRef<str>, bearer_token: Option<&str>,
    allow_file: bool,
  ) -> Result<(), BucketError> {
    let repository_url = repository_url.as_ref();
    let branch = branch.as_ref();
    validate_sync_branch(branch)?;
    if repository_url.starts_with('-') {
      return Err(BucketError::GitCommandFailed(
        "invalid repository URL for instance synchronization".to_owned(),
      ));
    }
    let transfer = RemoteGitTransfer::new().await?;
    let mut command = transfer.command(allow_file);
    command
      .current_dir(&self.path)
      .arg("fetch")
      .arg("--no-tags")
      .arg("--")
      .arg(repository_url)
      .arg(format!("+refs/heads/{branch}:{SYNC_CANDIDATE_REF}"));
    RemoteGitTransfer::apply_bearer_token(&mut command, bearer_token);
    let output = command.output().await;
    transfer.cleanup().await;
    let output = output?;
    if output.status.success() {
      trace!(stdio=?output, "fetched sync candidate ref from source repository");
      Ok(())
    } else {
      warn!(
        stdio=?output,
        "failed to fetch sync candidate ref from source repository"
      );
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn snapshot_changes(
    &self, rev: impl AsRef<str>,
  ) -> Result<Vec<DiffEntry>, BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("ls-tree")
      .arg("-r")
      .arg("--name-only")
      .arg("-z")
      .arg(rev.as_ref())
      .output()
      .await?;
    if !output.status.success() {
      return Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?));
    }
    output
      .stdout
      .split(|byte| *byte == 0)
      .filter(|path| !path.is_empty())
      .map(|path| {
        Ok(DiffEntry {
          status: "A".to_owned(),
          old_path: None,
          path: String::from_utf8(path.to_vec())?,
        })
      })
      .collect()
  }

  pub async fn validate_sync_tree(&self, rev: impl AsRef<str>) -> Result<(), BucketError> {
    const MAX_FILES: usize = 50_000;
    const MAX_FILE_SIZE: u64 = 512 * 1024 * 1024;
    const MAX_TOTAL_SIZE: u64 = 2 * 1024 * 1024 * 1024;

    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("ls-tree")
      .arg("-r")
      .arg("-l")
      .arg("-z")
      .arg(rev.as_ref())
      .output()
      .await?;
    if !output.status.success() {
      return Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?));
    }
    let mut files = 0usize;
    let mut total_size = 0u64;
    for record in output
      .stdout
      .split(|byte| *byte == 0)
      .filter(|record| !record.is_empty())
    {
      files += 1;
      if files > MAX_FILES {
        return Err(BucketError::GitCommandFailed(format!(
          "synchronized repository contains more than {MAX_FILES} files"
        )));
      }
      let separator = record
        .iter()
        .position(|byte| *byte == b'\t')
        .ok_or_else(|| {
          BucketError::GitCommandFailed("failed to parse synchronized tree entry".to_owned())
        })?;
      let metadata = &record[..separator];
      let path = String::from_utf8(record[separator + 1..].to_vec())?;
      if path.starts_with('/')
        || path.contains('\\')
        || path
          .split('/')
          .any(|part| matches!(part, "" | "." | ".." | ".git"))
      {
        return Err(BucketError::GitCommandFailed(format!(
          "synchronized repository contains an unsafe path: {path}"
        )));
      }
      let mut fields = metadata
        .split(|byte| *byte == b' ')
        .filter(|field| !field.is_empty());
      let mode = fields.next().unwrap_or_default();
      let object_type = fields.next().unwrap_or_default();
      let _object_id = fields.next().unwrap_or_default();
      let size = fields.next().unwrap_or_default();
      if object_type != b"blob" || !matches!(mode, b"100644" | b"100755") {
        return Err(BucketError::GitCommandFailed(format!(
          "synchronized repository contains an unsupported file type at {path}"
        )));
      }
      let size = String::from_utf8(size.to_vec())?
        .parse::<u64>()
        .map_err(|_| BucketError::GitCommandFailed("invalid synchronized file size".to_owned()))?;
      if size > MAX_FILE_SIZE {
        return Err(BucketError::GitCommandFailed(format!(
          "synchronized file exceeds the {MAX_FILE_SIZE}-byte limit: {path}"
        )));
      }
      total_size = total_size.checked_add(size).ok_or_else(|| {
        BucketError::GitCommandFailed("synchronized repository size overflow".to_owned())
      })?;
      if total_size > MAX_TOTAL_SIZE {
        return Err(BucketError::GitCommandFailed(format!(
          "synchronized repository exceeds the {MAX_TOTAL_SIZE}-byte limit"
        )));
      }
    }
    Ok(())
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

  pub fn resolve_list_path(&self, sub_path: impl AsRef<str>) -> Result<String, BucketError> {
    let sub_path = self.path.join(sub_path.as_ref()).canonicalize()?;
    if !sub_path.starts_with(&self.path) && sub_path != self.path {
      return Err(BucketError::PathTraversal);
    }
    let relative_path = repo_relative_path(&self.path, &sub_path)?;
    Ok(repo_index_path(&relative_path).to_owned())
  }

  /// List all objects in the git repository
  pub async fn list_objects(
    &self, sub_path: impl AsRef<str>,
  ) -> Result<Vec<ObjectInfo>, BucketError> {
    let relative_path = self.resolve_list_path(sub_path)?;
    let mut ls_tree = Command::new("git");
    ls_tree
      .current_dir(&self.path)
      .arg("ls-tree")
      .arg("-z")
      .arg("HEAD");
    if relative_path != REPO_ROOT_PATH {
      ls_tree.arg("--").arg(format!(":(literal){relative_path}/"));
    }

    let output = ls_tree.output().await?;
    if output.status.success() {
      trace!(stdio=?output, "got objects from git repository");
      let mut result = parse_ls_tree_objects(&output.stdout)?;
      if result.is_empty() {
        return Ok(result);
      }

      let mut git_log = Command::new("git");
      git_log
        .current_dir(&self.path)
        .arg("log")
        .arg("-m")
        .arg("--name-only")
        .arg("--no-renames")
        .arg("-z")
        .arg("--date=unix")
        .arg("--format=%x1e%h%x1f%s%x1f%aN%x1f%at")
        .arg("HEAD")
        .arg("--");
      for object in &result {
        git_log.arg(format!(":(literal){}", object.path));
      }

      let output = git_log.output().await?;
      if !output.status.success() {
        warn!(stdio=?output, "failed to get batched object info from git repository");
        return Err(BucketError::GitCommandFailed(String::from_utf8(
          output.stderr,
        )?));
      }
      trace!(stdio=?output, "got batched object info from git repository");
      let base_path = if relative_path == REPO_ROOT_PATH {
        ""
      } else {
        relative_path.as_str()
      };
      populate_object_commits(base_path, &output.stdout, &mut result)?;

      Ok(result)
    } else {
      warn!(stdio=?output, "failed to get objects from git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn build_path_index(&self, rev: impl AsRef<str>) -> Result<RepoPathIndex, BucketError> {
    let rev = rev.as_ref();
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("ls-tree")
      .arg("-r")
      .arg("-t")
      .arg("-z")
      .arg(rev)
      .output()
      .await?;
    if !output.status.success() {
      warn!(stdio=?output, rev, "failed to build repo path index object list");
      return Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?));
    }

    trace!(stdio=?output, rev, "got repo path index objects from git repository");
    let mut objects = parse_ls_tree_objects(&output.stdout)?;
    if objects.is_empty() {
      return Ok(group_objects_by_parent_path(objects));
    }

    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("log")
      .arg("-m")
      .arg("--name-only")
      .arg("--no-renames")
      .arg("-z")
      .arg("--date=unix")
      .arg("--format=%x1e%h%x1f%s%x1f%aN%x1f%at")
      .arg(rev)
      .output()
      .await?;
    if !output.status.success() {
      warn!(stdio=?output, rev, "failed to build repo path index commit data");
      return Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?));
    }

    trace!(stdio=?output, rev, "got repo path index commit data from git repository");
    populate_path_index_commits(&output.stdout, &mut objects)?;
    Ok(group_objects_by_parent_path(objects))
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

  pub async fn get_head_ref(&self) -> Result<String, BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("symbolic-ref")
      .arg("-q")
      .arg("HEAD")
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, "got HEAD ref from git repository");
      Ok(String::from_utf8(output.stdout)?.trim().to_string())
    } else {
      warn!(stdio=?output, "failed to get HEAD ref from git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn reset_hard(&self, rev: impl AsRef<str>) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("reset")
      .arg("--hard")
      .arg(rev.as_ref())
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, target=%rev.as_ref(), "reset git repository to target");
      Ok(())
    } else {
      warn!(stdio=?output, target=%rev.as_ref(), "failed to reset git repository to target");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  /// Resolves any revision (a ref like [`SYNC_CANDIDATE_REF`], `HEAD` or an
  /// OID) to the full commit OID. Annotated tags are peeled to their commit
  /// so callers always compare commits; `--end-of-options` keeps revisions
  /// that look like flags from being parsed as git options.
  pub async fn resolve_ref(&self, rev: impl AsRef<str>) -> Result<String, BucketError> {
    let rev = rev.as_ref();
    if rev.starts_with('-') {
      return Err(BucketError::GitCommandFailed(format!(
        "invalid revision for instance synchronization: {rev}"
      )));
    }
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("rev-parse")
      .arg("--verify")
      .arg("--end-of-options")
      .arg(format!("{rev}^{{commit}}"))
      .output()
      .await?;
    if output.status.success() {
      trace!(stdio=?output, rev, "resolved revision in git repository");
      Ok(String::from_utf8(output.stdout)?.trim().to_owned())
    } else {
      warn!(stdio=?output, rev, "failed to resolve revision in git repository");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  /// Returns whether `old_oid` is an ancestor of (or equal to) `new_oid`.
  /// Exit code 0 means yes, exit code 1 means no, anything else is a real
  /// command failure and surfaces as an error instead of a verdict.
  pub async fn is_ancestor(
    &self, old_oid: impl AsRef<str>, new_oid: impl AsRef<str>,
  ) -> Result<bool, BucketError> {
    let old_oid = old_oid.as_ref();
    let new_oid = new_oid.as_ref();
    if old_oid.starts_with('-') || new_oid.starts_with('-') {
      return Err(BucketError::GitCommandFailed(
        "invalid revision for instance synchronization".to_owned(),
      ));
    }
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("merge-base")
      .arg("--is-ancestor")
      .arg("--")
      .arg(old_oid)
      .arg(new_oid)
      .output()
      .await?;
    match output.status.code() {
      Some(0) => {
        trace!(stdio=?output, old=%old_oid, new=%new_oid, "revisions are related by ancestry");
        Ok(true)
      }
      Some(1) => {
        trace!(stdio=?output, old=%old_oid, new=%new_oid, "revisions are not related by ancestry");
        Ok(false)
      }
      status => {
        warn!(
          ?status,
          stdio=?output,
          old=%old_oid,
          new=%new_oid,
          "failed to check ancestry in git repository"
        );
        Err(BucketError::GitCommandFailed(format!(
          "merge-base --is-ancestor failed with status {status:?}: {}",
          String::from_utf8_lossy(&output.stderr).trim()
        )))
      }
    }
  }

  pub async fn update_ref(
    &self, ref_name: impl AsRef<str>, new_oid: impl AsRef<str>, old_oid: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("update-ref")
      .arg(ref_name.as_ref())
      .arg(new_oid.as_ref())
      .arg(old_oid.as_ref())
      .output()
      .await?;
    if output.status.success() {
      trace!(ref_name=%ref_name.as_ref(), new_oid=%new_oid.as_ref(), old_oid=%old_oid.as_ref(), "updated git ref");
      Ok(())
    } else {
      warn!(stdio=?output, ref_name=%ref_name.as_ref(), "failed to update git ref");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn delete_ref(
    &self, ref_name: impl AsRef<str>, old_oid: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("update-ref")
      .arg("-d")
      .arg(ref_name.as_ref())
      .arg(old_oid.as_ref())
      .output()
      .await?;
    if output.status.success() {
      trace!(ref_name=%ref_name.as_ref(), old_oid=%old_oid.as_ref(), "deleted git ref");
      Ok(())
    } else {
      warn!(stdio=?output, ref_name=%ref_name.as_ref(), "failed to delete git ref");
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn diff_name_status(
    &self, old_oid: impl AsRef<str>, new_oid: impl AsRef<str>,
  ) -> Result<Vec<DiffEntry>, BucketError> {
    // `-z` terminates every field with NUL: paths are passed through raw
    // bytes and never C-quoted, so non-ASCII bucket names survive the trip
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("diff")
      .arg("--name-status")
      .arg("--find-renames")
      .arg("-z")
      .arg(old_oid.as_ref())
      .arg(new_oid.as_ref())
      .output()
      .await?;
    if !output.status.success() {
      warn!(stdio=?output, "failed to diff git commits");
      return Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?));
    }

    let output = String::from_utf8(output.stdout)?;
    let mut fields = output.split('\0').filter(|field| !field.is_empty());
    let mut entries = Vec::new();
    while let Some(status) = fields.next() {
      // renames and copies carry the source path before the destination
      let is_rename = matches!(status.chars().next(), Some('R' | 'C'));
      let (old_path, path) = if is_rename {
        let Some(old_path) = fields.next() else {
          break;
        };
        let Some(path) = fields.next() else {
          break;
        };
        (Some(old_path.to_string()), path.to_string())
      } else {
        let Some(path) = fields.next() else {
          break;
        };
        (None, path.to_string())
      };
      entries.push(DiffEntry {
        status: status.to_string(),
        old_path,
        path,
      });
    }
    Ok(entries)
  }

  async fn stream_internal<T, S>(
    &self, protocol: impl AsRef<OsStr>, subcmd: impl AsRef<OsStr>, args: T,
    mut stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError>
  where
    T: IntoIterator<Item = S>,
    S: AsRef<OsStr>, {
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
    let stdout_fd = child
      .stdout
      .take()
      .ok_or_else(|| BucketError::GitCommandFailed("failed to capture git stdout".to_owned()))?;
    let mut stdin_fd = child
      .stdin
      .take()
      .ok_or_else(|| BucketError::GitCommandFailed("failed to capture git stdin".to_owned()))?;
    tokio::spawn(async move {
      // Feed the request body into git, then close stdin so the process sees
      // EOF even when the copy fails halfway through.
      if let Err(error) = tokio::io::copy(&mut stdin, &mut stdin_fd).await {
        warn!(?error, "failed to pipe request body into git process");
      }
      drop(stdin_fd);
      // Always reap the child: without `wait` it lingers as a zombie and keeps
      // its pipe file descriptors alive until the parent process exits.
      match child.wait().await {
        Ok(status) if !status.success() => {
          warn!(?status, "git process exited with failure");
        }
        Ok(_) => {}
        Err(error) => warn!(?error, "failed to wait for git process"),
      }
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
/// use r2s_bucket::git::to_pkt_line;
///
/// let message = "Hello, world!";
/// let pkt_line = to_pkt_line(message);
/// ```
pub fn to_pkt_line(msg: impl AsRef<str>) -> String {
  format!("{:04x}{}", msg.as_ref().len() + 4, msg.as_ref())
}

#[cfg(test)]
mod tests {
  use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
  };

  use super::{
    Git, entry_paths_for_changed_path, listed_entry_for_changed_path, parse_ls_tree_objects,
  };
  use crate::BucketError;

  fn temp_repo_path(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock before unix epoch")
      .as_nanos();
    std::env::temp_dir().join(format!("ret2shell-{name}-{}-{nanos}", std::process::id()))
  }

  fn run_git(repo: &PathBuf, args: &[&str]) {
    let status = Command::new("git")
      .arg("-C")
      .arg(repo)
      .args(args)
      .status()
      .expect("run git command");
    assert!(status.success(), "git command failed: {args:?}");
  }

  fn commit_all(repo: &PathBuf, message: &str, timestamp: &str) {
    run_git(repo, &["add", "--all"]);
    let status = Command::new("git")
      .arg("-C")
      .arg(repo)
      .env("GIT_AUTHOR_NAME", "Tester")
      .env("GIT_AUTHOR_EMAIL", "tester@example.com")
      .env("GIT_COMMITTER_NAME", "Tester")
      .env("GIT_COMMITTER_EMAIL", "tester@example.com")
      .env("GIT_AUTHOR_DATE", timestamp)
      .env("GIT_COMMITTER_DATE", timestamp)
      .args(["commit", "-m", message])
      .status()
      .expect("commit changes");
    assert!(status.success(), "git commit failed");
  }

  #[test]
  fn parse_ls_tree_objects_handles_nul_records() {
    let objects = parse_ls_tree_objects(
      b"100644 blob abc123\tdir/file.txt\0\
        040000 tree def456\tdir/subdir\0",
    )
    .expect("parse ls-tree objects");
    assert_eq!(objects.len(), 2);
    assert_eq!(objects[0].path, "dir/file.txt");
    assert_eq!(objects[0].commit, "abc123");
    assert_eq!(objects[1].path, "dir/subdir");
    assert_eq!(objects[1].r#type, "tree");
  }

  #[test]
  fn listed_entry_for_changed_path_maps_immediate_children() {
    assert_eq!(
      listed_entry_for_changed_path("", "challenges/world/static/simple").as_deref(),
      Some("challenges")
    );
    assert_eq!(
      listed_entry_for_changed_path("challenges", "challenges/world/static/simple").as_deref(),
      Some("challenges/world")
    );
    assert_eq!(
      listed_entry_for_changed_path("challenges", "challenges/.gitkeep").as_deref(),
      Some("challenges/.gitkeep")
    );
    assert_eq!(
      listed_entry_for_changed_path("challenges", "writeups/.gitkeep"),
      None
    );
  }

  #[test]
  fn entry_paths_for_changed_path_includes_each_ancestor() {
    assert_eq!(
      entry_paths_for_changed_path("challenges/world/static/simple"),
      vec![
        "challenges".to_owned(),
        "challenges/world".to_owned(),
        "challenges/world/static".to_owned(),
        "challenges/world/static/simple".to_owned(),
      ]
    );
    assert_eq!(
      entry_paths_for_changed_path("README.md"),
      vec!["README.md".to_owned()]
    );
  }

  #[tokio::test]
  async fn list_objects_batches_last_commit_lookup() {
    let repo = temp_repo_path("git-list-objects");
    fs::create_dir_all(repo.join("challenges/alpha")).expect("create alpha dir");
    fs::create_dir_all(repo.join("challenges/beta")).expect("create beta dir");

    run_git(&repo, &["init"]);
    fs::write(repo.join("challenges/alpha/README.md"), "alpha\n").expect("write alpha readme");
    fs::write(repo.join("challenges/beta/README.md"), "beta\n").expect("write beta readme");
    commit_all(&repo, "create challenges", "1700000000 +0000");

    fs::write(repo.join("challenges/alpha/README.md"), "alpha updated\n")
      .expect("update alpha readme");
    commit_all(&repo, "update alpha", "1700000060 +0000");

    let git = Git::try_open(&repo).await.expect("open git repo");
    let objects = git.list_objects("challenges").await.expect("list objects");
    let mut by_path = objects
      .into_iter()
      .map(|object| (object.path.clone(), object))
      .collect::<std::collections::HashMap<_, _>>();

    let alpha = by_path.remove("challenges/alpha").expect("alpha entry");
    assert_eq!(alpha.subject.as_deref(), Some("update alpha"));
    assert_eq!(alpha.author.as_deref(), Some("Tester"));
    assert!(alpha.last_modified.is_some());
    assert_ne!(alpha.commit.len(), 40);

    let beta = by_path.remove("challenges/beta").expect("beta entry");
    assert_eq!(beta.subject.as_deref(), Some("create challenges"));
    assert_eq!(beta.author.as_deref(), Some("Tester"));
    assert!(beta.last_modified.is_some());

    fs::remove_dir_all(repo).expect("remove temp repo");
  }

  #[tokio::test]
  async fn list_objects_keeps_merge_commit_as_latest_change() {
    let repo = temp_repo_path("git-list-objects-merge");
    fs::create_dir_all(repo.join("challenges/alpha")).expect("create alpha dir");

    run_git(&repo, &["init"]);
    fs::write(repo.join("challenges/alpha/README.md"), "base\n").expect("write base readme");
    commit_all(&repo, "base", "1700000000 +0000");

    run_git(&repo, &["checkout", "-b", "feature"]);
    fs::write(repo.join("challenges/alpha/README.md"), "feature\n").expect("write feature readme");
    commit_all(&repo, "feature", "1700000060 +0000");

    run_git(&repo, &["checkout", "master"]);
    fs::write(repo.join("challenges/alpha/README.md"), "master\n").expect("write master readme");
    commit_all(&repo, "master", "1700000120 +0000");

    let merge = Command::new("git")
      .arg("-C")
      .arg(&repo)
      .env("GIT_AUTHOR_NAME", "Tester")
      .env("GIT_AUTHOR_EMAIL", "tester@example.com")
      .env("GIT_COMMITTER_NAME", "Tester")
      .env("GIT_COMMITTER_EMAIL", "tester@example.com")
      .env("GIT_AUTHOR_DATE", "1700000180 +0000")
      .env("GIT_COMMITTER_DATE", "1700000180 +0000")
      .args(["merge", "feature"])
      .status()
      .expect("start merge");
    assert!(
      !merge.success(),
      "expected merge conflict to require resolution"
    );

    fs::write(repo.join("challenges/alpha/README.md"), "merged\n").expect("write merged readme");
    run_git(&repo, &["add", "challenges/alpha/README.md"]);
    let status = Command::new("git")
      .arg("-C")
      .arg(&repo)
      .env("GIT_AUTHOR_NAME", "Tester")
      .env("GIT_AUTHOR_EMAIL", "tester@example.com")
      .env("GIT_COMMITTER_NAME", "Tester")
      .env("GIT_COMMITTER_EMAIL", "tester@example.com")
      .env("GIT_AUTHOR_DATE", "1700000180 +0000")
      .env("GIT_COMMITTER_DATE", "1700000180 +0000")
      .args(["commit", "-m", "merge"])
      .status()
      .expect("finish merge commit");
    assert!(status.success(), "git merge commit failed");

    let git = Git::try_open(&repo).await.expect("open git repo");
    let objects = git.list_objects("challenges").await.expect("list objects");
    let alpha = objects
      .into_iter()
      .find(|object| object.path == "challenges/alpha")
      .expect("alpha entry");

    assert_eq!(alpha.subject.as_deref(), Some("merge"));
    assert_eq!(alpha.author.as_deref(), Some("Tester"));

    fs::remove_dir_all(repo).expect("remove temp repo");
  }

  #[tokio::test]
  async fn build_path_index_lists_nested_directories_without_git_calls_per_request() {
    let repo = temp_repo_path("git-build-path-index");
    fs::create_dir_all(repo.join("challenges/alpha/static")).expect("create challenge dirs");

    run_git(&repo, &["init"]);
    fs::write(repo.join("README.md"), "root\n").expect("write root readme");
    fs::write(repo.join("challenges/alpha/README.md"), "alpha\n").expect("write alpha readme");
    fs::write(repo.join("challenges/alpha/static/logo.txt"), "logo\n").expect("write nested asset");
    commit_all(&repo, "create challenge tree", "1700000000 +0000");

    fs::write(
      repo.join("challenges/alpha/static/logo.txt"),
      "logo updated\n",
    )
    .expect("update nested asset");
    commit_all(&repo, "update nested asset", "1700000060 +0000");

    let git = Git::try_open(&repo).await.expect("open git repo");
    let index = git
      .build_path_index("HEAD")
      .await
      .expect("build path index");

    let root = index.list(".");
    let challenges = root
      .iter()
      .find(|object| object.path == "challenges")
      .expect("root challenges entry");
    assert_eq!(challenges.subject.as_deref(), Some("update nested asset"));

    let challenge_entries = index.list("challenges");
    let alpha = challenge_entries
      .iter()
      .find(|object| object.path == "challenges/alpha")
      .expect("alpha dir entry");
    assert_eq!(alpha.subject.as_deref(), Some("update nested asset"));

    let alpha_entries = index.list("challenges/alpha");
    let readme = alpha_entries
      .iter()
      .find(|object| object.path == "challenges/alpha/README.md")
      .expect("alpha readme entry");
    assert_eq!(readme.subject.as_deref(), Some("create challenge tree"));
    let static_dir = alpha_entries
      .iter()
      .find(|object| object.path == "challenges/alpha/static")
      .expect("alpha static dir entry");
    assert_eq!(static_dir.subject.as_deref(), Some("update nested asset"));

    let static_entries = index.list("challenges/alpha/static");
    let asset = static_entries
      .iter()
      .find(|object| object.path == "challenges/alpha/static/logo.txt")
      .expect("nested asset entry");
    assert_eq!(asset.subject.as_deref(), Some("update nested asset"));

    fs::remove_dir_all(repo).expect("remove temp repo");
  }

  #[tokio::test]
  async fn try_open_rejects_a_directory_that_is_not_a_git_repository() {
    let dir = temp_repo_path("git-not-a-repo");
    fs::create_dir_all(&dir).expect("create plain directory");

    let result = Git::try_open(&dir).await;
    assert!(matches!(result, Err(BucketError::GitCommandFailed(_))));

    fs::remove_dir_all(dir).expect("remove plain directory");
  }

  #[tokio::test]
  async fn try_open_rejects_an_incomplete_git_directory() {
    let dir = temp_repo_path("git-incomplete");
    fs::create_dir_all(dir.join(".git")).expect("create bare .git directory");

    let result = Git::try_open(&dir).await;
    assert!(matches!(result, Err(BucketError::GitCommandFailed(_))));

    fs::remove_dir_all(dir).expect("remove incomplete repository");
  }
}

#[cfg(test)]
mod sync_tests {
  use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
  };

  use super::{Git, RemoteGitTransfer, SYNC_CANDIDATE_REF, validate_sync_branch};

  fn temp_path(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock before unix epoch")
      .as_nanos();
    std::env::temp_dir().join(format!(
      "ret2shell-sync-{name}-{}-{nanos}",
      std::process::id()
    ))
  }

  fn run_git(repo: &Path, args: &[&str]) {
    let status = Command::new("git")
      .arg("-C")
      .arg(repo)
      .args(args)
      .status()
      .expect("run git command");
    assert!(status.success(), "git command failed: {args:?}");
  }

  fn commit_all(repo: &Path) {
    run_git(repo, &["add", "--all"]);
    let status = Command::new("git")
      .arg("-C")
      .arg(repo)
      .env("GIT_AUTHOR_NAME", "Tester")
      .env("GIT_AUTHOR_EMAIL", "tester@example.com")
      .env("GIT_COMMITTER_NAME", "Tester")
      .env("GIT_COMMITTER_EMAIL", "tester@example.com")
      .args(["commit", "-m", "sync fixture"])
      .status()
      .expect("commit fixture");
    assert!(status.success(), "git commit failed");
  }

  fn rev_parse(repo: &Path, rev: &str) -> String {
    let output = Command::new("git")
      .arg("-C")
      .arg(repo)
      .arg("rev-parse")
      .arg(rev)
      .output()
      .expect("run git rev-parse");
    assert!(output.status.success(), "git rev-parse failed for {rev}");
    String::from_utf8(output.stdout)
      .expect("utf-8 oid")
      .trim()
      .to_owned()
  }

  fn commit_file(repo: &Path, name: &str, content: &str) -> String {
    fs::write(repo.join(name), content).unwrap();
    commit_all(repo);
    rev_parse(repo, "HEAD")
  }

  fn file_url(repo: &Path) -> String {
    format!("file://{}", repo.display())
  }

  #[tokio::test]
  async fn snapshot_changes_marks_every_tracked_file_as_added() {
    let repo = temp_path("snapshot");
    fs::create_dir_all(repo.join("challenges/web/checker")).unwrap();
    fs::create_dir_all(repo.join("challenges/web/static")).unwrap();
    fs::write(repo.join("challenges/web/config.toml"), "name = 'web'").unwrap();
    fs::write(
      repo.join("challenges/web/checker/main.rx"),
      "pub async fn check() {}",
    )
    .unwrap();
    fs::write(repo.join("challenges/web/static/handout.txt"), "handout").unwrap();
    run_git(&repo, &["init"]);
    commit_all(&repo);

    let git = Git::try_open(&repo).await.unwrap();
    let mut changes = git.snapshot_changes("HEAD").await.unwrap();
    changes.sort_by(|left, right| left.path.cmp(&right.path));
    assert_eq!(changes.len(), 3);
    assert!(changes.iter().all(|change| change.status == "A"));
    assert!(changes.iter().all(|change| change.old_path.is_none()));
    assert!(
      changes
        .iter()
        .any(|change| change.path == "challenges/web/checker/main.rx")
    );
    assert!(
      changes
        .iter()
        .any(|change| change.path == "challenges/web/static/handout.txt")
    );

    fs::remove_dir_all(repo).unwrap();
  }

  #[cfg(unix)]
  #[tokio::test]
  async fn sync_tree_rejects_symbolic_links() {
    let repo = temp_path("symlink");
    fs::create_dir_all(&repo).unwrap();
    fs::write(repo.join("target.txt"), "target").unwrap();
    std::os::unix::fs::symlink("target.txt", repo.join("link.txt")).unwrap();
    run_git(&repo, &["init"]);
    commit_all(&repo);

    let git = Git::try_open(&repo).await.unwrap();
    let error = git.validate_sync_tree("HEAD").await.unwrap_err();
    assert!(error.to_string().contains("unsupported file type"));

    fs::remove_dir_all(repo).unwrap();
  }

  #[tokio::test]
  async fn clone_rejects_local_file_transport() {
    let destination = temp_path("clone-file");
    let result = Git::clone("file:///tmp/ret2shell-sync-source", &destination, None).await;
    assert!(result.is_err());
    assert!(!destination.exists());
  }

  #[test]
  fn sync_branch_validation_rejects_dangerous_names() {
    for branch in [
      "",
      "--upload-pack=/bin/sh",
      "-oProxyCommand=evil",
      ".hidden",
      "trailing.",
      "release.lock",
      "a..b",
      "a/.hidden",
      "/leading",
      "trailing/",
      "double//slash",
      "with space",
      "with~tilde",
      "with^caret",
      "with:colon",
      "with?question",
      "with[bracket",
      "with*star",
      "with\\backslash",
      "with@{brace",
      "@",
    ] {
      assert!(validate_sync_branch(branch).is_err(), "accepted {branch:?}");
    }
    for branch in ["main", "master", "release/1.0", "dev_feature", "v1.0.x"] {
      assert!(validate_sync_branch(branch).is_ok(), "rejected {branch:?}");
    }
  }

  #[tokio::test]
  async fn remote_transfer_keeps_the_bearer_token_out_of_argv() {
    let transfer = RemoteGitTransfer::new().await.unwrap();
    let mut command = transfer.command(false);
    command
      .arg("fetch")
      .arg("--no-tags")
      .arg("--")
      .arg("https://ctf.example.org/api/game/1/repo/poc.git")
      .arg(format!("+refs/heads/main:{SYNC_CANDIDATE_REF}"));
    RemoteGitTransfer::apply_bearer_token(&mut command, Some("sync-top-secret-token"));

    let command = command.as_std();
    assert_eq!(command.get_program().to_string_lossy(), "git");
    let argv: Vec<String> = command
      .get_args()
      .map(|arg| arg.to_string_lossy().to_string())
      .collect();
    assert!(!argv.join(" ").contains("sync-top-secret-token"));
    // the credential still rides along through the environment, not argv
    let header = command
      .get_envs()
      .find(|(key, _)| *key == std::ffi::OsStr::new("GIT_CONFIG_VALUE_0"))
      .and_then(|(_, value)| value)
      .map(|value| value.to_string_lossy().to_string());
    assert_eq!(
      header.as_deref(),
      Some("Authorization: Bearer sync-top-secret-token")
    );

    transfer.cleanup().await;
  }

  #[tokio::test]
  async fn fetch_rejects_local_file_transport() {
    let repo = temp_path("fetch-file");
    fs::create_dir_all(&repo).unwrap();
    fs::write(repo.join("one.txt"), "one").unwrap();
    run_git(&repo, &["init"]);
    commit_all(&repo);
    let git = Git::try_open(&repo).await.unwrap();
    let result = git
      .fetch("file:///tmp/ret2shell-sync-source", "main", None)
      .await;
    assert!(result.is_err());
    // the rejected transfer must not have created the candidate ref either
    assert!(git.resolve_ref(SYNC_CANDIDATE_REF).await.is_err());
    fs::remove_dir_all(repo).unwrap();
  }

  #[tokio::test]
  async fn resolve_ref_returns_the_full_commit_oid() {
    let repo = temp_path("resolve");
    fs::create_dir_all(&repo).unwrap();
    fs::write(repo.join("config.toml"), "name = 'x'").unwrap();
    run_git(&repo, &["init"]);
    run_git(&repo, &["branch", "-M", "main"]);
    commit_all(&repo);
    let head = rev_parse(&repo, "HEAD");

    let git = Git::try_open(&repo).await.unwrap();
    assert_eq!(git.resolve_ref("HEAD").await.unwrap(), head);
    assert_eq!(git.resolve_ref("refs/heads/main").await.unwrap(), head);
    assert_eq!(git.resolve_ref(head.as_str()).await.unwrap(), head);
    assert!(git.resolve_ref("refs/heads/missing").await.is_err());

    fs::remove_dir_all(repo).unwrap();
  }

  #[tokio::test]
  async fn is_ancestor_classifies_ancestry_and_equality() {
    let repo = temp_path("ancestor");
    fs::create_dir_all(&repo).unwrap();
    run_git(&repo, &["init"]);
    run_git(&repo, &["branch", "-M", "main"]);
    let first = commit_file(&repo, "one.txt", "one");
    let second = commit_file(&repo, "two.txt", "two");
    let third = commit_file(&repo, "three.txt", "three");
    // an orphan branch yields a commit in the same repository that shares no
    // history with main; the OIDs of other repositories are simply unknown
    // objects here and are command errors, not ancestry verdicts
    run_git(&repo, &["checkout", "--orphan", "unrelated"]);
    let unrelated = commit_file(&repo, "other.txt", "other");
    run_git(&repo, &["checkout", "main"]);

    let git = Git::try_open(&repo).await.unwrap();
    assert!(git.is_ancestor(&first, &third).await.unwrap());
    assert!(git.is_ancestor(&second, &third).await.unwrap());
    assert!(!git.is_ancestor(&third, &first).await.unwrap());
    assert!(git.is_ancestor(&second, &second).await.unwrap());
    assert!(!git.is_ancestor(&unrelated, &third).await.unwrap());

    fs::remove_dir_all(repo).unwrap();
  }

  #[cfg(unix)]
  #[tokio::test]
  async fn fetch_updates_the_candidate_ref_without_moving_head() {
    let source = temp_path("fetch-src");
    fs::create_dir_all(&source).unwrap();
    run_git(&source, &["init"]);
    run_git(&source, &["branch", "-M", "main"]);
    let first = commit_file(&source, "one.txt", "one");
    let destination = temp_path("fetch-dst");
    let git = Git::clone_for_test(file_url(&source), &destination, None)
      .await
      .unwrap();
    assert_eq!(git.get_head().await.unwrap(), first);

    let second = commit_file(&source, "two.txt", "two");
    git
      .fetch_for_test(&file_url(&source), "main", None)
      .await
      .unwrap();

    assert_eq!(git.get_head_ref().await.unwrap(), "refs/heads/main");
    assert_eq!(git.get_head().await.unwrap(), first);
    assert_eq!(git.resolve_ref(SYNC_CANDIDATE_REF).await.unwrap(), second);
    // fetching never checks the candidate out into the working tree
    assert!(!destination.join("two.txt").exists());

    fs::remove_dir_all(&source).unwrap();
    fs::remove_dir_all(&destination).unwrap();
  }

  #[cfg(unix)]
  #[tokio::test]
  async fn forced_candidate_updates_are_reported_as_non_fast_forward() {
    let source = temp_path("force-src");
    fs::create_dir_all(&source).unwrap();
    run_git(&source, &["init"]);
    run_git(&source, &["branch", "-M", "main"]);
    let base = commit_file(&source, "one.txt", "one");
    let original = commit_file(&source, "two.txt", "two");
    let destination = temp_path("force-dst");
    let git = Git::clone_for_test(file_url(&source), &destination, None)
      .await
      .unwrap();
    let local_head = git.get_head().await.unwrap();
    assert_eq!(local_head, original);

    // rewrite the upstream history so master no longer contains `original`
    run_git(&source, &["reset", "--hard", base.as_str()]);
    let rewritten = commit_file(&source, "three.txt", "three");

    git
      .fetch_for_test(&file_url(&source), "main", None)
      .await
      .unwrap();

    assert_eq!(
      git.resolve_ref(SYNC_CANDIDATE_REF).await.unwrap(),
      rewritten
    );
    // the candidate moved, but the move is not a fast-forward of local HEAD
    assert!(!git.is_ancestor(&local_head, &rewritten).await.unwrap());
    assert!(git.is_ancestor(&base, &rewritten).await.unwrap());
    assert_eq!(git.get_head().await.unwrap(), local_head);

    fs::remove_dir_all(&source).unwrap();
    fs::remove_dir_all(&destination).unwrap();
  }
}

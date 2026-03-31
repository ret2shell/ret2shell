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

impl Git {
  pub fn path(&self) -> &Path {
    &self.path
  }

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
    let git_status = self.status_porcelain().await?;
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

  pub async fn status_porcelain(&self) -> Result<String, BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("status")
      .arg("-u")
      .arg("--porcelain")
      .output()
      .await?;
    if output.status.success() {
      Ok(String::from_utf8(output.stdout)?)
    } else {
      Err(BucketError::GitCommandFailed(String::from_utf8(
        output.stderr,
      )?))
    }
  }

  pub async fn is_clean(&self) -> Result<bool, BucketError> {
    Ok(self.status_porcelain().await?.trim().is_empty())
  }

  pub async fn get_ref(&self, ref_name: impl AsRef<str>) -> Result<Option<String>, BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("rev-parse")
      .arg("--verify")
      .arg(ref_name.as_ref())
      .output()
      .await?;
    if output.status.success() {
      Ok(Some(String::from_utf8(output.stdout)?.trim().to_string()))
    } else {
      let stderr = String::from_utf8(output.stderr)?;
      if stderr.contains("Needed a single revision") || stderr.contains("unknown revision") {
        Ok(None)
      } else {
        Err(BucketError::GitCommandFailed(stderr))
      }
    }
  }

  pub async fn set_ref(
    &self, ref_name: impl AsRef<str>, new_oid: impl AsRef<str>,
  ) -> Result<(), BucketError> {
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("update-ref")
      .arg(ref_name.as_ref())
      .arg(new_oid.as_ref())
      .output()
      .await?;
    if output.status.success() {
      Ok(())
    } else {
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
    let output = Command::new("git")
      .current_dir(&self.path)
      .arg("diff")
      .arg("--name-status")
      .arg("--find-renames")
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
    let mut entries = Vec::new();
    for line in output.lines() {
      let mut parts = line.split('\t');
      let Some(status) = parts.next() else {
        continue;
      };
      let Some(first_path) = parts.next() else {
        continue;
      };
      let second_path = parts.next();
      let (old_path, path) = if let Some(path) = second_path {
        (Some(first_path.to_string()), path.to_string())
      } else {
        (None, first_path.to_string())
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
    stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError>
  where
    T: IntoIterator<Item = S>,
    S: AsRef<OsStr>, {
    self
      .stream_internal_with_config(
        protocol,
        std::iter::empty::<(&str, &str)>(),
        subcmd,
        args,
        stdin,
      )
      .await
  }

  async fn stream_internal_with_config<T, S, C, K, V>(
    &self, protocol: impl AsRef<OsStr>, config: C, subcmd: impl AsRef<OsStr>, args: T,
    mut stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError>
  where
    T: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
    C: IntoIterator<Item = (K, V)>,
    K: AsRef<str>,
    V: AsRef<str>, {
    let mut cmd = Command::new("git");
    for (key, value) in config {
      cmd
        .arg("-c")
        .arg(format!("{}={}", key.as_ref(), value.as_ref()));
    }
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

  pub async fn info_refs_upload_release_only(
    &self, protocol: impl AsRef<OsStr>, release_ref: &str,
    stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError> {
    self
      .stream_internal_with_config(
        protocol,
        release_only_uploadpack_config(release_ref),
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

  pub async fn upload_pack_release_only(
    &self, protocol: impl AsRef<OsStr>, release_ref: &str,
    stdin: impl AsyncRead + Unpin + Send + 'static,
  ) -> Result<ChildStdout, BucketError> {
    self
      .stream_internal_with_config(
        protocol,
        release_only_uploadpack_config(release_ref),
        "upload-pack",
        ["--stateless-rpc"],
        stdin,
      )
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

fn release_only_uploadpack_config(release_ref: &str) -> Vec<(String, String)> {
  vec![
    ("uploadpack.hideRefs".to_owned(), "HEAD".to_owned()),
    ("uploadpack.hideRefs".to_owned(), "refs".to_owned()),
    (
      "uploadpack.hideRefs".to_owned(),
      format!("!{}", release_ref.trim_matches('/')),
    ),
  ]
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
    release_only_uploadpack_config,
  };

  #[test]
  fn release_only_uploadpack_config_hides_all_other_refs() {
    let config = release_only_uploadpack_config("refs/ret2shell/releases/deadbeef");
    assert_eq!(
      config,
      vec![
        ("uploadpack.hideRefs".to_owned(), "HEAD".to_owned()),
        ("uploadpack.hideRefs".to_owned(), "refs".to_owned()),
        (
          "uploadpack.hideRefs".to_owned(),
          "!refs/ret2shell/releases/deadbeef".to_owned(),
        ),
      ]
    );
  }

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
}

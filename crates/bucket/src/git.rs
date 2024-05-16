use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Stdio,
};

use tokio::{fs::create_dir_all, io::AsyncRead, process::Command};
use tracing::{debug, trace, warn};

use crate::BucketError;

#[derive(Clone, Debug)]
pub struct Git {
    path: PathBuf,
}

impl Git {
    pub async fn try_open(path: impl AsRef<Path>) -> Result<Self, BucketError> {
        if path.as_ref().exists() {
            debug!("opening git repository: {:?}", path.as_ref());
        } else {
            warn!("git repository does not exist: {:?}", path.as_ref());
            return Err(BucketError::PathDoesNotExist(
                path.as_ref().display().to_string(),
            ));
        }
        let output = Command::new("git")
            .current_dir(&path)
            .arg("describe")
            .arg("--all")
            .arg("--long")
            .output()
            .await?;
        if output.status.success() {
            trace!("opened git repository: {:?}", output);
            Ok(Self {
                path: path.as_ref().to_path_buf(),
            })
        } else {
            warn!("failed to open git repository: {:?}", output);
            Err(BucketError::GitCommandFailed(String::from_utf8(
                output.stderr,
            )?))
        }
    }

    pub async fn new(path: impl AsRef<Path>) -> Result<Self, BucketError> {
        if path.as_ref().exists() {
            warn!("folder already exists: {:?}", path.as_ref());
            return Err(BucketError::PathConflict(
                path.as_ref().display().to_string(),
            ));
        }
        create_dir_all(&path).await?;
        Self::init(&path).await
    }

    async fn init(path: impl AsRef<Path>) -> Result<Self, BucketError> {
        if path.as_ref().exists() {
            debug!("opening git repository: {:?}", path.as_ref());
        } else {
            warn!("git repository does not exist: {:?}", path.as_ref());
            return Err(BucketError::PathDoesNotExist(
                path.as_ref().display().to_string(),
            ));
        }
        let output = Command::new("git")
            .current_dir(&path)
            .arg("init")
            .output()
            .await?;
        if output.status.success() {
            trace!("initialized git repository: {:?}", output);
            Ok(Self {
                path: path.as_ref().to_path_buf(),
            })
        } else {
            warn!("failed to initialize git repository: {:?}", output);
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
            trace!("added all files to git repository: {:?}", output);
            Ok(())
        } else {
            warn!("failed to add all files to git repository: {:?}", output);
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
            .arg("commit")
            .arg("--no-gpg-sign")
            .arg("--author")
            .arg(format!("{} <{}>", author.as_ref(), email.as_ref()))
            .arg("-m")
            .arg(message.as_ref())
            .output()
            .await?;
        if output.status.success() {
            trace!("committed to git repository: {:?}", output);
            Ok(())
        } else {
            warn!("failed to commit to git repository: {:?}", output);
            Err(BucketError::GitCommandFailed(String::from_utf8(
                output.stderr,
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
            trace!("checked out HEAD in git repository: {:?}", output);
            Ok(())
        } else {
            warn!("failed to checkout HEAD in git repository: {:?}", output);
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
            trace!("checked out branch in git repository: {:?}", output);
            Ok(())
        } else {
            warn!("failed to checkout branch in git repository: {:?}", output);
            Err(BucketError::GitCommandFailed(String::from_utf8(
                output.stderr,
            )?))
        }
    }

    pub async fn cleanup(&self) -> Result<(), BucketError> {
        self.reset_head_internal().await?;
        self.clean_untracked().await
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
            trace!("reset HEAD in git repository: {:?}", output);
            Ok(())
        } else {
            warn!("failed to reset HEAD in git repository: {:?}", output);
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
            trace!("cleaned up git repository: {:?}", output);
            Ok(())
        } else {
            warn!("failed to clean up git repository: {:?}", output);
            Err(BucketError::GitCommandFailed(String::from_utf8(
                output.stderr,
            )?))
        }
    }

    pub async fn get_commits(&self) -> Result<Vec<String>, BucketError> {
        let output = Command::new("git")
            .current_dir(&self.path)
            .arg("log")
            .arg("--reflog")
            .arg("--pretty='%H %at %s'")
            .output()
            .await?;
        if output.status.success() {
            trace!("got commits from git repository: {:?}", output);
            Ok(String::from_utf8(output.stdout)?
                .split('\n')
                .map(String::from)
                .collect())
        } else {
            warn!("failed to get commits from git repository: {:?}", output);
            Err(BucketError::GitCommandFailed(String::from_utf8(
                output.stderr,
            )?))
        }
    }

    async fn stream_internal<T, S>(
        &self, protocol: impl AsRef<OsStr>, subcmd: impl AsRef<OsStr>, args: T,
        mut stdin: impl AsyncRead + Unpin + Send + 'static,
    ) -> Result<impl AsyncRead, BucketError>
    where
        T: IntoIterator<Item = S>,
        S: AsRef<OsStr>, {
        let mut cmd = Command::new("git");
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .env("GIT_PROTOCOL", protocol)
            .arg(subcmd.as_ref())
            .args(args)
            .arg(self.path.as_os_str());
        debug!("run cmd: {:?}", cmd);
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
    ) -> Result<impl AsyncRead, BucketError> {
        self.stream_internal(
            protocol,
            "receive-pack",
            ["--stateless-rpc", "--advertise-refs"],
            stdin,
        )
        .await
    }

    pub async fn info_refs_upload(
        &self, protocol: impl AsRef<OsStr>, stdin: impl AsyncRead + Unpin + Send + 'static,
    ) -> Result<impl AsyncRead, BucketError> {
        debug!("get info refs for repo: {:?}", self.path);
        self.stream_internal(
            protocol,
            "upload-pack",
            ["--stateless-rpc", "--advertise-refs"],
            stdin,
        )
        .await
    }

    pub async fn upload_pack(
        &self, protocol: impl AsRef<OsStr>, stdin: impl AsyncRead + Unpin + Send + 'static,
    ) -> Result<impl AsyncRead, BucketError> {
        self.stream_internal(protocol, "upload-pack", ["--stateless-rpc"], stdin)
            .await
    }

    pub async fn receive_pack(
        &self, protocol: impl AsRef<OsStr>, stdin: impl AsyncRead + Unpin + Send + 'static,
    ) -> Result<impl AsyncRead, BucketError> {
        self.stream_internal(protocol, "receive-pack", ["--stateless-rpc"], stdin)
            .await
    }
}

use axum::{
  body::Body,
  extract::FromRef,
  http::StatusCode,
  response::{IntoResponse, Response},
};
use hyper_util::client::legacy::connect::HttpConnector;
use r2s_auditor::Auditor;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_checker::Checker;
use r2s_cluster::Cluster;
use r2s_config::GlobalConfig;
use r2s_database::DbErr;
use r2s_event::EventManager;
use r2s_license::License;
use r2s_media::Media;
use r2s_migrator::Database;
use r2s_oauth::OAuth;
use r2s_queue::Queue;
use thiserror::Error;
use tracing::{error, warn};

type HTTPClient = hyper_util::client::legacy::Client<HttpConnector, Body>;

#[derive(Clone, FromRef)]
pub struct GlobalState {
  pub config: GlobalConfig,
  pub requestor: HTTPClient,
  pub db: Database,
  pub cache: Cache,
  pub auditor: Auditor,
  pub bucket: Bucket,
  pub queue: Queue,
  pub oauth: OAuth,
  pub cluster: Cluster,
  pub license: License,
  pub media: Media,
  pub checker: Checker,
  pub event: EventManager,
  pub version: String,
}

#[derive(Debug, Error)]
pub enum ResponseError {
  #[error("internal server error: {0}, {1}")]
  InternalServerError(String, String),
  #[error("unauthorized: {0}")]
  Unauthorized(String),
  #[error("bad request: {0}")]
  BadRequest(String),
  #[error("forbidden: {0}, {1}")]
  Forbidden(String, String),
  #[error("not found: {0}")]
  NotFound(String),
  #[error("resource is outdated: {0}")]
  Gone(String),
  #[error("conflict: {0}")]
  Conflict(String),
  #[error("precondition failed: {0}")]
  PreconditionFailed(String),
  #[error("too many requests: {0}, {1}")]
  TooManyRequests(String, String),
  #[error("database error: {0}")]
  DatabaseError(#[from] r2s_database::DbErr),
  #[error("cache error: {0}")]
  CacheError(#[from] r2s_cache::CacheError),
  #[error("queue error: {0}")]
  QueueError(#[from] r2s_queue::QueueError),
  #[error("captcha error: {0}")]
  CaptchaError(#[from] r2s_captcha::CaptchaError),
  #[error("password hashing error: {0}")]
  PasswordHashError(#[from] crate::utility::password::PasswordHashingError),
  #[error("serialize error: {0}")]
  SerializeError(#[from] serde_json::Error),
  #[error("bucket error: {0}")]
  BucketError(#[from] r2s_bucket::BucketError),
  #[error("media storage error: {0}")]
  MediaError(#[from] r2s_media::MediaError),
  #[error("file io error: {0}")]
  FileIoError(#[from] std::io::Error),
  #[error("cluster error: {0}")]
  ClusterError(#[from] r2s_cluster::ClusterError),
  #[error("OAuth error: {0}")]
  OAuthError(#[from] r2s_oauth::OAuthError),
  #[error("Checker error: {0}")]
  CheckerError(#[from] r2s_checker::traits::CheckerError),
  #[error("string decode error: {0}")]
  StringDecodeError(#[from] std::string::FromUtf8Error),
}

macro_rules! log_with_resp {
  ($code:expr, $summary:expr, $detail:expr) => {{
    if ($code).is_server_error() {
      error!("{}: {}", $summary, $detail);
    } else {
      warn!("{}: {}", $summary, $detail);
    }
    ($code, $summary)
  }};
}

impl IntoResponse for ResponseError {
  fn into_response(self) -> Response<Body> {
    let (status, message) = match self {
      ResponseError::InternalServerError(summary, detail) => {
        log_with_resp!(StatusCode::INTERNAL_SERVER_ERROR, summary, detail)
      }
      ResponseError::Unauthorized(summary) => (StatusCode::UNAUTHORIZED, summary),
      ResponseError::BadRequest(summary) => (StatusCode::BAD_REQUEST, summary),
      ResponseError::Forbidden(summary, detail) => {
        log_with_resp!(StatusCode::FORBIDDEN, summary, detail)
      }
      ResponseError::NotFound(summary) => (StatusCode::NOT_FOUND, summary),
      ResponseError::Conflict(summary) => (StatusCode::CONFLICT, summary),
      ResponseError::TooManyRequests(summary, detail) => {
        log_with_resp!(StatusCode::TOO_MANY_REQUESTS, summary, detail)
      }
      ResponseError::PreconditionFailed(summary) => (StatusCode::PRECONDITION_FAILED, summary),
      ResponseError::DatabaseError(e) => match e {
        DbErr::RecordNotFound(s) => (StatusCode::NOT_FOUND, format!("record not found: {s}")),
        DbErr::Json(_) => (
          StatusCode::INTERNAL_SERVER_ERROR,
          "data cruptted".to_owned(),
        ),
        _ => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "database internal error".to_owned(),
          e.to_string()
        ),
      },
      ResponseError::Gone(summary) => (StatusCode::GONE, summary),
      ResponseError::CacheError(e) => match e {
        r2s_cache::CacheError::DomainNeeded(s) => {
          log_with_resp!(StatusCode::BAD_REQUEST, "cache domain needed".to_owned(), s)
        }
        r2s_cache::CacheError::ConfigNeeded => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "missing cache".to_owned(),
            "cache config is not set yet"
          )
        }
        r2s_cache::CacheError::Redis(_) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "cache server seems down".to_owned(),
            "cache server seems down"
          )
        }
        r2s_cache::CacheError::Serde(_) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "cached data consistency is compromised".to_owned(),
            "failed to serialize data"
          )
        }
        _ => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "cache internal error".to_owned(),
          e.to_string()
        ),
      },
      ResponseError::QueueError(e) => match e {
        r2s_queue::QueueError::PublishError(s) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "message queue refused publishing".to_owned(),
            s
          )
        }
        _ => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "queue internal error".to_owned(),
          e.to_string()
        ),
      },
      ResponseError::CaptchaError(e) => {
        log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to generate captcha".to_owned(),
          e.to_string()
        )
      }
      ResponseError::PasswordHashError(e) => {
        log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to hash password".to_owned(),
          e.to_string()
        )
      }
      ResponseError::SerializeError(e) => {
        log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to serialize data".to_owned(),
          e.to_string()
        )
      }
      ResponseError::BucketError(e) => match e {
        r2s_bucket::BucketError::PathDoesNotExist(s) => {
          log_with_resp!(
            StatusCode::NOT_FOUND,
            "bucket path does not exist".to_owned(),
            s
          )
        }
        r2s_bucket::BucketError::PathConflict(s) => {
          log_with_resp!(StatusCode::CONFLICT, "bucket path conflict".to_owned(), s)
        }
        r2s_bucket::BucketError::LockError => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "could not lock the bucket".to_owned(),
            "bucket is locked by another process"
          )
        }
        r2s_bucket::BucketError::DataConvertError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to read string from bucket, data maybe binary".to_owned(),
            format!("failed to convert data type from bucket: {e:?}")
          )
        }
        _ => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "bucket internal error".to_owned(),
          e.to_string()
        ),
      },
      ResponseError::MediaError(e) => match e {
        r2s_media::MediaError::ParseContentTypeError(e) => {
          log_with_resp!(
            StatusCode::BAD_REQUEST,
            "failed to parse content type".to_owned(),
            e.to_string()
          )
        }
        r2s_media::MediaError::UnsupportedFileType(s) => {
          log_with_resp!(
            StatusCode::BAD_REQUEST,
            "unsupported file type".to_owned(),
            s
          )
        }
        r2s_media::MediaError::MediaStoragePathNotConfigured => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "media storage path not configured".to_owned(),
            "media storage path is not set yet"
          )
        }
        _ => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "media internal error".to_owned(),
          format!("media internal error: {e:?}")
        ),
      },
      ResponseError::FileIoError(e) => {
        log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "file io error".to_owned(),
          format!("failed to read/write file: {e:?}")
        )
      }
      ResponseError::ClusterError(e) => match e {
        r2s_cluster::ClusterError::NeedNamespace(s) => {
          log_with_resp!(
            StatusCode::BAD_REQUEST,
            "cluster called without namespace, maybe a bug for ret2shell".to_owned(),
            s
          )
        }
        r2s_cluster::ClusterError::ConfigNeeded => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "missing cluster config".to_owned(),
            "cluster config is not set yet"
          )
        }
        r2s_cluster::ClusterError::ClusterDisabled => {
          log_with_resp!(
            StatusCode::NOT_FOUND,
            "cluster is disabled".to_owned(),
            "please setup cluster first and enable it in the config file"
          )
        }
        r2s_cluster::ClusterError::PodRenewExceedLimit(s) => {
          log_with_resp!(
            StatusCode::TOO_MANY_REQUESTS,
            "pod renew exceed limit".to_owned(),
            s
          )
        }
        r2s_cluster::ClusterError::AllocError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to build script engine runtime".to_owned(),
            format!("failed to build script engine runtime: {e:?}")
          )
        }
        r2s_cluster::ClusterError::BuildError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to build traffic script unit".to_owned(),
            format!("failed to build traffic script unit: {e:?}")
          )
        }
        r2s_cluster::ClusterError::CompileError(e) => {
          log_with_resp!(
            StatusCode::BAD_REQUEST,
            "failed to compile traffic script".to_owned(),
            format!("failed to compile traffic script: {e:?}")
          )
        }
        r2s_cluster::ClusterError::DiagnosticsError(e) => {
          log_with_resp!(
            StatusCode::BAD_REQUEST,
            "failed to generate traffic script diagnostics".to_owned(),
            format!("failed to generate traffic script diagnostics: {e:?}")
          )
        }
        r2s_cluster::ClusterError::ExecError(e) => {
          log_with_resp!(
            StatusCode::BAD_REQUEST,
            "error occurs in traffic script function".to_owned(),
            format!("error occurs in traffic script function: {e:?}")
          )
        }
        r2s_cluster::ClusterError::InvalidImageFileType(e) => (
          StatusCode::BAD_REQUEST,
          format!("invalid image file type: {e:?}"),
        ),
        r2s_cluster::ClusterError::MissingFunction(e) => (
          StatusCode::PRECONDITION_FAILED,
          format!("missing traffic script function: {e:?}"),
        ),
        r2s_cluster::ClusterError::MissingField(e) => (
          StatusCode::BAD_REQUEST,
          format!("missing traffic script function parameters: {e:?}"),
        ),
        r2s_cluster::ClusterError::TrafficMapperNotFound(e) => (
          StatusCode::NOT_FOUND,
          format!("traffic mapper not found: {e:?}"),
        ),
        r2s_cluster::ClusterError::SourceError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "could not load traffic script".to_owned(),
          format!("could not load traffic script: {e:?}")
        ),
        r2s_cluster::ClusterError::PodNotFound(e) => (
          StatusCode::NOT_FOUND,
          format!("requested instance is not found in cluster: {e:?}"),
        ),
        r2s_cluster::ClusterError::NetworkError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to sync with managed registry in cluster".to_owned(),
          format!("failed to sync with managed registry: {e:?}")
        ),
        r2s_cluster::ClusterError::ProxyError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to proxy traffic through wsrx".to_owned(),
          format!("failed to proxy traffic through wsrx: {e:?}")
        ),
        r2s_cluster::ClusterError::UploadFailed(e) => log_with_resp!(
          StatusCode::BAD_REQUEST,
          "failed to upload image into registry".to_owned(),
          format!("failed to upload image into registry: {e:?}")
        ),
        r2s_cluster::ClusterError::ScriptError(e) => log_with_resp!(
          StatusCode::BAD_REQUEST,
          "failed to upload image into registry".to_owned(),
          format!("failed to upload image into registry: {e:?}")
        ),
        _ => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "cluster internal error".to_owned(),
          format!("cluster internal error: {e:?}")
        ),
      },
      ResponseError::OAuthError(e) => match e {
        r2s_oauth::OAuthError::NetworkError(_) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "missing OAuth config".to_owned(),
            "OAuth config is not set yet"
          )
        }
        _ => log_with_resp!(
          StatusCode::FORBIDDEN,
          "failed to login with 3rd account".to_owned(),
          format!("failed to login with 3rd account: {e:?}")
        ),
      },
      ResponseError::CheckerError(e) => match e {
        r2s_checker::traits::CheckerError::MissingCheckerScript(_) => {
          log_with_resp!(
            StatusCode::PRECONDITION_FAILED,
            "missing checker script for challenge".to_owned(),
            format!("missing checker script for challenge: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::MissingFunction(e) => {
          log_with_resp!(
            StatusCode::PRECONDITION_FAILED,
            format!("missing function for challenge: {e:?}"),
            format!("missing function for challenge: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::CompileError(e) => {
          log_with_resp!(
            StatusCode::PRECONDITION_FAILED,
            "failed to compile checker script".to_owned(),
            format!("failed to compile checker script: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::AllocError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to build checker script engine".to_owned(),
          format!("failed to build checker script engine: {e:?}")
        ),
        r2s_checker::traits::CheckerError::ExecError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to execute checker script".to_owned(),
          format!("failed to execute checker script: {e:?}")
        ),
        r2s_checker::traits::CheckerError::DiagnosticsError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to generate checker script diagnostics".to_owned(),
          format!("failed to generate checker script diagnostics: {e:?}")
        ),
        r2s_checker::traits::CheckerError::MissingResultField(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "missing values in checker script results".to_owned(),
            format!("missing values in checker script results: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::BuildError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to build checker script unit".to_owned(),
            format!("failed to build checker script unit: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::SourceError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to load checker script source".to_owned(),
            format!("failed to load checker script source: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::RuneError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "error occurs in checker script context, please check server logs".to_owned(),
            format!("error occurs in checker script context: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::RuneRuntimeError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "error occurs in checker script engine, please check server logs".to_owned(),
            format!("error occurs in checker script engine: {e:?}")
          )
        }
        r2s_checker::traits::CheckerError::ScriptError(_) => (
          StatusCode::PRECONDITION_FAILED,
          "checker fails on your input, incorrect".to_owned(),
        ),
        _ => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "checker internal error".to_owned(),
            e.to_string()
          )
        }
      },
      ResponseError::StringDecodeError(e) => {
        log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to decode string".to_owned(),
          e.to_string()
        )
      }
    };
    Response::builder()
      .status(status)
      .body(message.into())
      .unwrap()
  }
}

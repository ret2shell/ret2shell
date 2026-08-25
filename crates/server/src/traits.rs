use axum::{
  body::Body,
  extract::FromRef,
  http::StatusCode,
  response::{IntoResponse, Response},
};
use hyper_util::client::legacy::{Client as HyperLegacyClient, connect::HttpConnector};
use r2s_auditor::Auditor;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_checker::Checker;
use r2s_cluster::Cluster;
use r2s_config::GlobalConfig;
use r2s_database::DbErr;
use r2s_engine::Engine;
use r2s_event::EventManager;
use r2s_media::Media;
use r2s_migrator::Database;
use r2s_oauth::OAuth;
use r2s_queue::Queue;
use thiserror::Error;
use tracing::{error, warn};

pub type HTTPClient = HyperLegacyClient<HttpConnector, Body>;

#[derive(Clone, FromRef)]
pub struct GlobalState {
  pub config: GlobalConfig,
  pub requestor: HTTPClient,
  pub db: Database,
  pub cache: Cache,
  pub auditor: Auditor,
  pub bucket: Bucket,
  pub engine: Engine,
  pub queue: Queue,
  pub oauth: OAuth,
  pub cluster: Cluster,
  pub media: Media,
  pub checker: Checker,
  pub event: EventManager,
  pub version: String,
}

#[derive(Debug, Error)]
pub enum ResponseError {
  #[error("internal server error: {0}")]
  InternalServerError(String),
  #[error("unauthorized: {0}")]
  Unauthorized(String),
  #[error("bad request: {0}")]
  BadRequest(String),
  #[error("forbidden: {0}")]
  Forbidden(String),
  #[error("not found: {0}")]
  NotFound(String),
  #[error("resource is outdated: {0}")]
  Gone(String),
  #[error("conflict: {0}")]
  Conflict(String),
  #[error("precondition failed: {0}")]
  PreconditionFailed(String),
  #[error("too many requests: {0}")]
  TooManyRequests(String),
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
  #[error("oauth error: {0}")]
  OAuthError(#[from] r2s_oauth::OAuthError),
  #[error("script engine error: {0}")]
  EngineError(#[from] r2s_engine::EngineError),
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
      ResponseError::InternalServerError(summary) => (StatusCode::INTERNAL_SERVER_ERROR, summary),
      ResponseError::Unauthorized(summary) => (StatusCode::UNAUTHORIZED, summary),
      ResponseError::BadRequest(summary) => (StatusCode::BAD_REQUEST, summary),
      ResponseError::Forbidden(summary) => (StatusCode::FORBIDDEN, summary),

      ResponseError::NotFound(summary) => (StatusCode::NOT_FOUND, summary),
      ResponseError::Conflict(summary) => (StatusCode::CONFLICT, summary),
      ResponseError::TooManyRequests(summary) => (StatusCode::TOO_MANY_REQUESTS, summary),
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
        r2s_bucket::BucketError::PathTraversal => {
          log_with_resp!(
            StatusCode::BAD_REQUEST,
            "bucket path traversal detected".to_owned(),
            "path traversal detected"
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
        r2s_cluster::ClusterError::InvalidImageFileType(e) => (
          StatusCode::BAD_REQUEST,
          format!("invalid image file type: {e:?}"),
        ),
        r2s_cluster::ClusterError::MissingField(e) => (
          StatusCode::BAD_REQUEST,
          format!("missing traffic script function parameters: {e:?}"),
        ),
        r2s_cluster::ClusterError::TrafficMapperNotFound(e) => (
          StatusCode::NOT_FOUND,
          format!("traffic mapper not found: {e:?}"),
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
      ResponseError::EngineError(e) => match e {
        r2s_engine::EngineError::MissingCheckerScript(_) => {
          log_with_resp!(
            StatusCode::PRECONDITION_FAILED,
            "missing checker script for challenge".to_owned(),
            format!("missing checker script for challenge: {e:?}")
          )
        }
        r2s_engine::EngineError::MissingFunction(e) => {
          log_with_resp!(
            StatusCode::PRECONDITION_FAILED,
            format!("missing function for challenge: {e:?}"),
            format!("missing function for challenge: {e:?}")
          )
        }
        r2s_engine::EngineError::CompileError(e) => {
          log_with_resp!(
            StatusCode::PRECONDITION_FAILED,
            "failed to compile checker script".to_owned(),
            format!("failed to compile checker script: {e:?}")
          )
        }
        r2s_engine::EngineError::AllocError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to build checker script engine".to_owned(),
          format!("failed to build checker script engine: {e:?}")
        ),
        r2s_engine::EngineError::ExecError(e) => log_with_resp!(
          StatusCode::INTERNAL_SERVER_ERROR,
          "failed to execute checker script".to_owned(),
          format!("failed to execute checker script: {e:?}")
        ),
        r2s_engine::EngineError::MissingResultField(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "missing values in checker script results".to_owned(),
            format!("missing values in checker script results: {e:?}")
          )
        }
        r2s_engine::EngineError::BuildError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to build checker script unit".to_owned(),
            format!("failed to build checker script unit: {e:?}")
          )
        }
        r2s_engine::EngineError::SourceError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to load checker script source".to_owned(),
            format!("failed to load checker script source: {e:?}")
          )
        }
        r2s_engine::EngineError::RuneError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "error occurs in checker script context, please check server logs".to_owned(),
            format!("error occurs in checker script context: {e:?}")
          )
        }
        r2s_engine::EngineError::RuneRuntimeError(e) => {
          log_with_resp!(
            StatusCode::INTERNAL_SERVER_ERROR,
            "error occurs in checker script engine, please check server logs".to_owned(),
            format!("error occurs in checker script engine: {e:?}")
          )
        }
        r2s_engine::EngineError::ScriptError(_) => (
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
      .header("Content-Type", "text/plain")
      .body(message.into())
      .unwrap()
  }
}

#[cfg(test)]
mod tests {
  use axum::{body::to_bytes, http::StatusCode, response::IntoResponse};
  use r2s_bucket::BucketError;
  use r2s_cache::CacheError;
  use r2s_captcha::CaptchaError;
  use r2s_cluster::ClusterError;
  use r2s_database::DbErr;
  use r2s_engine::EngineError;
  use r2s_media::MediaError;
  use r2s_oauth::OAuthError;
  use r2s_queue::QueueError;

  use super::ResponseError;

  fn status_of(err: ResponseError) -> StatusCode {
    err.into_response().status()
  }

  #[tokio::test]
  async fn explicit_variants_map_to_matching_status_codes() {
    let cases = [
      (
        ResponseError::InternalServerError("x".into()),
        StatusCode::INTERNAL_SERVER_ERROR,
      ),
      (
        ResponseError::Unauthorized("x".into()),
        StatusCode::UNAUTHORIZED,
      ),
      (
        ResponseError::BadRequest("x".into()),
        StatusCode::BAD_REQUEST,
      ),
      (ResponseError::Forbidden("x".into()), StatusCode::FORBIDDEN),
      (ResponseError::NotFound("x".into()), StatusCode::NOT_FOUND),
      (ResponseError::Gone("x".into()), StatusCode::GONE),
      (ResponseError::Conflict("x".into()), StatusCode::CONFLICT),
      (
        ResponseError::PreconditionFailed("x".into()),
        StatusCode::PRECONDITION_FAILED,
      ),
      (
        ResponseError::TooManyRequests("x".into()),
        StatusCode::TOO_MANY_REQUESTS,
      ),
    ];
    for (err, expected) in cases {
      assert_eq!(status_of(err), expected);
    }
  }

  #[test]
  fn database_errors_map_record_not_found_to_404_and_rest_to_500() {
    assert_eq!(
      status_of(DbErr::RecordNotFound("game".into()).into()),
      StatusCode::NOT_FOUND
    );
    assert_eq!(
      status_of(DbErr::Json("bad json".into()).into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
      status_of(DbErr::Custom("boom".into()).into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
  }

  #[test]
  fn cache_errors_map_domain_needed_to_400_and_the_rest_to_500() {
    let json_error = serde_json::from_str::<serde_json::Value>("not json").unwrap_err();
    let cases = [
      (
        CacheError::DomainNeeded("key".into()),
        StatusCode::BAD_REQUEST,
      ),
      (CacheError::ConfigNeeded, StatusCode::INTERNAL_SERVER_ERROR),
      (
        CacheError::Serde(json_error),
        StatusCode::INTERNAL_SERVER_ERROR,
      ),
      (
        CacheError::Other("down".into()),
        StatusCode::INTERNAL_SERVER_ERROR,
      ),
    ];
    for (err, expected) in cases {
      assert_eq!(status_of(err.into()), expected);
    }
  }

  #[test]
  fn queue_and_captcha_and_password_and_serialize_errors_are_server_faults() {
    assert_eq!(
      status_of(QueueError::ConfigNotFound.into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
      status_of(CaptchaError::Unknown.into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
    let bcrypt_error = bcrypt::verify("password", "not-a-bcrypt-hash").unwrap_err();
    assert_eq!(
      status_of(crate::utility::password::PasswordHashingError::BcryptError(bcrypt_error).into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
    let serialize_error = serde_json::from_str::<serde_json::Value>("<xml>").unwrap_err();
    assert_eq!(
      status_of(serialize_error.into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
      status_of(std::io::Error::other("disk").into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
  }

  #[test]
  fn bucket_errors_follow_resource_semantics() {
    let utf8_error = String::from_utf8(vec![0xFF, 0xFE]).unwrap_err();
    let cases = [
      (
        BucketError::PathDoesNotExist("p".into()),
        StatusCode::NOT_FOUND,
      ),
      (BucketError::PathConflict("p".into()), StatusCode::CONFLICT),
      (BucketError::LockError, StatusCode::INTERNAL_SERVER_ERROR),
      (
        BucketError::DataConvertError(utf8_error),
        StatusCode::INTERNAL_SERVER_ERROR,
      ),
      (BucketError::PathTraversal, StatusCode::BAD_REQUEST),
      (BucketError::NeedLocking, StatusCode::INTERNAL_SERVER_ERROR),
    ];
    for (err, expected) in cases {
      assert_eq!(status_of(err.into()), expected);
    }
  }

  #[test]
  fn media_errors_reject_unsupported_types_with_400() {
    assert_eq!(
      status_of(MediaError::UnsupportedFileType("exe".into()).into()),
      StatusCode::BAD_REQUEST
    );
    assert_eq!(
      status_of(MediaError::MediaStoragePathNotConfigured.into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
      status_of(std::io::Error::other("io").into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
  }

  #[test]
  fn cluster_errors_map_client_faults_to_4xx_and_infra_to_500() {
    let cases = [
      (
        ClusterError::NeedNamespace("ns".into()),
        StatusCode::BAD_REQUEST,
      ),
      (
        ClusterError::ConfigNeeded,
        StatusCode::INTERNAL_SERVER_ERROR,
      ),
      (ClusterError::ClusterDisabled, StatusCode::NOT_FOUND),
      (
        ClusterError::PodRenewExceedLimit("renew".into()),
        StatusCode::TOO_MANY_REQUESTS,
      ),
      (
        ClusterError::InvalidImageFileType("zip".into()),
        StatusCode::BAD_REQUEST,
      ),
      (
        ClusterError::MissingField("traffic".into()),
        StatusCode::BAD_REQUEST,
      ),
      (
        ClusterError::PodNotFound("pod".into()),
        StatusCode::NOT_FOUND,
      ),
      (
        ClusterError::TrafficMapperNotFound("script".into()),
        StatusCode::NOT_FOUND,
      ),
      (
        ClusterError::UploadFailed("denied".into()),
        StatusCode::BAD_REQUEST,
      ),
      (
        ClusterError::PathTraversalDetected("../".into()),
        StatusCode::INTERNAL_SERVER_ERROR,
      ),
    ];
    for (err, expected) in cases {
      assert_eq!(status_of(err.into()), expected);
    }
  }

  #[test]
  fn oauth_script_failures_are_forbidden_to_clients() {
    assert_eq!(
      status_of(OAuthError::MissingField("auth_key".into()).into()),
      StatusCode::FORBIDDEN
    );
    assert_eq!(
      status_of(OAuthError::ScriptError("script failed".into()).into()),
      StatusCode::FORBIDDEN
    );
    assert_eq!(
      status_of(OAuthError::AdapterUnavailable("github".into()).into()),
      StatusCode::FORBIDDEN
    );
  }

  #[test]
  fn engine_errors_distinguish_checker_failures_from_infra_faults() {
    let precondition_cases = [
      EngineError::MissingCheckerScript("challenge-x".into()),
      EngineError::MissingFunction("check".into()),
      EngineError::CompileError("syntax".into()),
      EngineError::ScriptError("flag mismatch".into()),
    ];
    for err in precondition_cases {
      assert_eq!(status_of(err.into()), StatusCode::PRECONDITION_FAILED);
    }
    let server_cases = [
      EngineError::IoError(std::io::Error::other("io")),
      EngineError::MissingResultField("result".into()),
      EngineError::InvalidReturnType {
        expected: "`Result`".into(),
        actual: "Null".into(),
      },
    ];
    for err in server_cases {
      assert_eq!(status_of(err.into()), StatusCode::INTERNAL_SERVER_ERROR);
    }
  }

  #[test]
  fn string_decode_errors_report_internal_faults() {
    let utf8_error = String::from_utf8(vec![0xFF]).unwrap_err();
    assert_eq!(
      status_of(utf8_error.into()),
      StatusCode::INTERNAL_SERVER_ERROR
    );
  }

  #[tokio::test]
  async fn responses_are_plain_text_bodies() {
    let response = ResponseError::BadRequest("invalid input".to_owned()).into_response();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
      response.headers().get("Content-Type").unwrap(),
      "text/plain"
    );
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    assert_eq!(body.as_ref(), b"invalid input");
  }
}

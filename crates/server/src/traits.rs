use axum::{
    body::Body,
    extract::FromRef,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use r2s_auditor::Auditor;
use r2s_bucket::Bucket;
use r2s_cache::Cache;
use r2s_checker::Checker;
use r2s_cluster::Cluster;
use r2s_config::GlobalConfig;
use r2s_database::DbErr;
use r2s_license::License;
use r2s_media::Media;
use r2s_migrator::Database;
use r2s_queue::Queue;
use thiserror::Error;
use tracing::{error, warn};

#[derive(Clone, FromRef)]
pub struct GlobalState {
    pub config: GlobalConfig,
    pub db: Database,
    pub cache: Cache,
    pub auditor: Auditor,
    pub bucket: Bucket,
    pub queue: Queue,
    pub cluster: Cluster,
    pub license: License,
    pub media: Media,
    pub checker: Checker,
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
            ResponseError::PreconditionFailed(summary) => {
                (StatusCode::PRECONDITION_FAILED, summary)
            }
            ResponseError::DatabaseError(e) => match e {
                DbErr::RecordNotFound(s) => {
                    (StatusCode::NOT_FOUND, format!("record not found: {s}"))
                }
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
                    e.to_string()
                ),
            },
            ResponseError::FileIoError(e) => {
                log_with_resp!(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "file io error".to_owned(),
                    e.to_string()
                )
            }
            ResponseError::ClusterError(e) => {
                log_with_resp!(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "cluster internal error".to_owned(),
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

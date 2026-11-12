use axum::{
  Extension, Json, Router,
  extract::{Path, State},
  http::StatusCode,
  middleware,
  response::IntoResponse,
  routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc, serde::ts_seconds};
use r2s_cache::Cache;
use r2s_database::{
  config, passkey,
  user::{self, Permission},
};
use r2s_migrator::Database;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use url::Url;
use webauthn_rs::prelude::{
  CredentialID, DiscoverableAuthentication, DiscoverableKey, Passkey, RegisterPublicKeyCredential,
  Webauthn, WebauthnBuilder, WebauthnError,
};

use crate::{
  middleware::{
    auth::{Token, TokenTracker, permission_required_all},
    data,
  },
  traits::{GlobalState, ResponseError},
};

/// Lifetime of the cached registration/authentication states, matching the
/// challenge timeout sent to the browser.
const STATE_TTL: i64 = 300;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .route("/", get(list_passkeys))
    .route("/register/options", post(register_passkey_options))
    .route("/register", post(register_passkey))
    .route(
      "/{id}",
      axum::routing::patch(rename_passkey).delete(delete_passkey),
    )
    .route_layer(middleware::from_fn(permission_required_all!(
      Permission::Basic
    )))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      data::prepare_user_info,
    ))
    .route("/login/options", post(login_passkey_options))
    .route("/login", post(login_with_passkey))
}

fn build_webauthn(config: &config::Model) -> Result<Webauthn, ResponseError> {
  let server = config.server.as_ref().ok_or_else(|| {
    warn!("server config not found, passkey is not available");
    ResponseError::NotFound("server config".to_owned())
  })?;
  let origin = Url::parse(&server.external_origin()).map_err(|err| {
    warn!(?err, origin=%server.external_origin(), "invalid external origin for passkey");
    ResponseError::NotFound("server config".to_owned())
  })?;
  // Derive the relying party id from the origin host so deployments that pin a
  // port in `external_domain` (e.g. a local test instance) still line up with
  // the origin the browser reports.
  let rp_id = origin.host_str().ok_or_else(|| {
    warn!(origin=%server.external_origin(), "external origin has no host for passkey");
    ResponseError::NotFound("server config".to_owned())
  })?;
  let mut builder = WebauthnBuilder::new(rp_id, &origin).map_err(|err| {
    warn!(
      ?err,
      rp_id, "rp id is not an effective domain of the external origin, passkey is not available"
    );
    ResponseError::NotFound("server config".to_owned())
  })?;
  if let Some(name) = server.name.as_deref() {
    builder = builder.rp_name(name);
  }
  builder.build().map_err(|err| {
    warn!(?err, "failed to build webauthn instance");
    ResponseError::NotFound("server config".to_owned())
  })
}

fn webauthn_error(err: WebauthnError) -> ResponseError {
  warn!(?err, "passkey verification failed");
  ResponseError::Forbidden("passkey verification failed".to_owned())
}

/// Canonical string form of a credential id, matching the base64url-unpadded
/// encoding used on the wire.
fn credential_id_string(cred_id: &CredentialID) -> String {
  URL_SAFE_NO_PAD.encode(cred_id.as_slice())
}

fn passkey_from_model(model: &passkey::Model) -> Option<Passkey> {
  serde_json::from_value(model.registration.clone())
    .map_err(|err| {
      warn!(
        id=%model.id,
        credential_id=%model.credential_id,
        ?err,
        "failed to deserialize stored passkey registration"
      );
      err
    })
    .ok()
}

#[derive(Serialize)]
struct PasskeyItem {
  pub id: i64,
  pub name: String,
  pub credential_id: String,
  #[serde(with = "chrono::serde::ts_seconds_option")]
  pub last_used_at: Option<DateTime<Utc>>,
  #[serde(with = "ts_seconds")]
  pub created_at: DateTime<Utc>,
}

async fn list_passkeys(
  State(db): State<Database>, Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let passkeys = passkey::get_list(&db.conn, user.id).await?;
  Ok(Json(
    passkeys
      .into_iter()
      .map(|item| PasskeyItem {
        id: item.id,
        name: item.name,
        credential_id: item.credential_id,
        last_used_at: item.last_used_at,
        created_at: item.created_at,
      })
      .collect::<Vec<_>>(),
  ))
}

#[derive(Serialize)]
struct PasskeyOptionsResponse {
  pub token: String,
  pub options: serde_json::Value,
}

async fn register_passkey_options(
  State(db): State<Database>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>, Extension(user): Extension<user::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let webauthn = build_webauthn(&config)?;

  // avoid registering the same authenticator twice for one user
  let mut exclude_credentials = Vec::new();
  for item in passkey::get_list(&db.conn, user.id).await? {
    if let Some(key) = passkey_from_model(&item) {
      exclude_credentials.push(key.cred_id().clone());
    }
  }

  let (ccr, state) = webauthn
    .start_passkey_registration(
      uuid::Uuid::from_u64_pair(user.id as u64, 0),
      &user.account,
      &user.nickname,
      if exclude_credentials.is_empty() {
        None
      } else {
        Some(exclude_credentials)
      },
    )
    .map_err(webauthn_error)?;
  // `start_passkey_registration` asks for a discouraged resident key, but the
  // login flow is discoverable (no username is entered), so the credential has
  // to live on the authenticator. The library derives `residentKey` from a
  // builder flag it does not expose, so the serialised options are adjusted
  // here before they reach the browser. `residentKey` is a request to the
  // client, not something the server can enforce: see the `credProps` check
  // in `register_passkey` for the best-effort rejection of credentials that
  // were not stored on the authenticator.
  let mut options = serde_json::to_value(&ccr)?;
  let selection = options
    .get_mut("publicKey")
    .and_then(|public_key| public_key.get_mut("authenticatorSelection"))
    .ok_or_else(|| {
      warn!("passkey registration options are missing authenticatorSelection");
      ResponseError::InternalServerError("passkey options".to_owned())
    })?;
  selection["residentKey"] = serde_json::Value::String("required".to_owned());
  selection["requireResidentKey"] = serde_json::Value::Bool(true);

  let token = nanoid::nanoid!(32);
  cache
    .at("passkey")
    .set_ex(&token, &state, STATE_TTL)
    .await?;

  Ok(Json(PasskeyOptionsResponse { token, options }))
}

#[derive(Deserialize)]
struct RegisterPasskeyRequest {
  pub token: String,
  #[serde(default)]
  pub name: String,
  pub credential: RegisterPublicKeyCredential,
}

async fn register_passkey(
  State(db): State<Database>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>, Extension(user): Extension<user::Model>,
  Json(body): Json<RegisterPasskeyRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let webauthn = build_webauthn(&config)?;
  let state = cache
    .at("passkey")
    .getdel::<webauthn_rs::prelude::PasskeyRegistration>(&body.token)
    .await?
    .ok_or_else(|| ResponseError::NotFound("passkey token".to_owned()))?;

  let key = webauthn
    .finish_passkey_registration(&body.credential, &state)
    .map_err(webauthn_error)?;

  // `residentKey: required` cannot be enforced by the server: webauthn-rs-core
  // does not verify that the authenticator actually created a discoverable
  // credential, so a client that ignores the hint would otherwise register a
  // credential that `start_discoverable_authentication` can never find. The
  // unsigned `credProps` extension output is the only signal about what
  // happened on the client: when a browser reports `rk: false`, reject the
  // registration instead of storing a passkey that cannot log in. Browsers
  // that do not return `credProps` are accepted — the signal is best-effort,
  // and password login remains available either way.
  if body
    .credential
    .extensions
    .cred_props
    .as_ref()
    .and_then(|cred_props| cred_props.rk)
    == Some(false)
  {
    warn!(
      user_id = user.id,
      "rejecting passkey registration: the client reported a non-resident credential"
    );
    return Err(ResponseError::BadRequest(
      "the authenticator did not store this passkey locally, so it could not be used to log in"
        .to_owned(),
    ));
  }

  let credential_id = credential_id_string(key.cred_id());
  if passkey::get_by_credential_id(&db.conn, &credential_id)
    .await?
    .is_some()
  {
    return Err(ResponseError::Conflict(
      "passkey credential already exists".to_owned(),
    ));
  }

  let name = body.name.trim().chars().take(63).collect::<String>();
  let item = passkey::Model {
    id: 0,
    user_id: user.id,
    name,
    credential_id,
    registration: serde_json::to_value(&key)?,
    last_used_at: None,
    created_at: Utc::now(),
    updated_at: Utc::now(),
  };
  let item = passkey::create(&db.conn, item).await?;

  info!(
    id=%item.id,
    user_id=%user.id,
    account=%user.account,
    credential_id=%item.credential_id,
    "new passkey registered"
  );
  Ok((StatusCode::OK, Json(item.id)))
}

#[derive(Deserialize)]
struct RenamePasskeyRequest {
  pub name: String,
}

async fn rename_passkey(
  State(db): State<Database>, Extension(token): Extension<Token>,
  Extension(user): Extension<user::Model>, Path(id): Path<i64>,
  Json(body): Json<RenamePasskeyRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let item = passkey::get(&db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("passkey".to_owned()))?;
  if item.user_id != token.id {
    warn!(
      id=%item.id,
      peer_user_id=%item.user_id,
      account=%user.account,
      "user try to rename passkey which is not belong to him"
    );
    return Err(ResponseError::Forbidden(
      "you can only rename your own passkey".to_owned(),
    ));
  }
  let item = passkey::Model {
    name: body.name.trim().chars().take(63).collect(),
    ..item
  };
  passkey::update(&db.conn, id, item).await?;
  Ok(StatusCode::OK)
}

async fn delete_passkey(
  State(db): State<Database>, Extension(token): Extension<Token>,
  Extension(user): Extension<user::Model>, Path(id): Path<i64>,
) -> Result<impl IntoResponse, ResponseError> {
  let item = passkey::get(&db.conn, id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("passkey".to_owned()))?;
  if item.user_id != token.id {
    warn!(
      id=%item.id,
      peer_user_id=%item.user_id,
      account=%user.account,
      "user try to delete passkey which is not belong to him"
    );
    return Err(ResponseError::Forbidden(
      "you can only delete your own passkey".to_owned(),
    ));
  }
  passkey::delete(&db.conn, id).await?;
  info!(id=%item.id, user_id=%item.user_id, account=%user.account, "passkey deleted");
  Ok(StatusCode::OK)
}

#[derive(Serialize)]
struct PasskeyLoginOptionsResponse {
  pub token: String,
  pub options: webauthn_rs::prelude::RequestChallengeResponse,
}

async fn login_passkey_options(
  State(cache): State<Cache>, Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let webauthn = build_webauthn(&config)?;

  // Discoverable credentials: the authenticator lets the user pick a passkey,
  // so no credential list is collected from the database or sent to the
  // client. The conditional-mediation hint added by the library is ignored by
  // the frontend, which opens the regular credential selector.
  let (acr, state) = webauthn
    .start_discoverable_authentication()
    .map_err(webauthn_error)?;

  let token = nanoid::nanoid!(32);
  cache
    .at("passkey")
    .set_ex(&token, &state, STATE_TTL)
    .await?;

  Ok(Json(PasskeyLoginOptionsResponse {
    token,
    options: acr,
  }))
}

#[derive(Deserialize)]
struct LoginPasskeyRequest {
  pub token: String,
  pub credential: webauthn_rs::prelude::PublicKeyCredential,
}

async fn login_with_passkey(
  State(db): State<Database>, State(cache): State<Cache>,
  Extension(config): Extension<config::Model>, Extension(token): Extension<Token>,
  Extension(token_tracker): Extension<TokenTracker>, Json(body): Json<LoginPasskeyRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if token.id > 0 {
    return Err(ResponseError::Conflict(
      "you have already logged in".to_owned(),
    ));
  }
  let webauthn = build_webauthn(&config)?;
  let state = cache
    .at("passkey")
    .getdel::<DiscoverableAuthentication>(&body.token)
    .await?
    .ok_or_else(|| ResponseError::NotFound("passkey token".to_owned()))?;

  // rate limit per credential, mirroring the password login attempt counter
  let credential_key = body.credential.id.clone();
  let attempts = cache
    .at("passkey-login")
    .get::<i64>(&credential_key)
    .await?;
  if attempts.is_some_and(|attempts| attempts > 5) {
    warn!(credential_id=%credential_key, "credential is frozen due to too many login attempts");
    return Err(ResponseError::TooManyRequests(
      "this credential is frozen in 30 mins".to_owned(),
    ));
  }
  cache.at("passkey-login").incr(&credential_key).await?;
  cache
    .at("passkey-login")
    .expire(&credential_key, 30 * 60)
    .await?;

  // The authenticator reports which passkey it used; look that credential up
  // and hand it to the verifier as the only allowed credential.
  let (user_unique_id, credential_id) = webauthn
    .identify_discoverable_authentication(&body.credential)
    .map_err(webauthn_error)?;
  // An unknown credential is reported as a failed verification rather than a
  // missing resource, so the endpoint cannot be used to probe which credential
  // ids the platform knows about.
  let item = passkey::get_by_credential_id(&db.conn, &URL_SAFE_NO_PAD.encode(credential_id))
    .await?
    .ok_or_else(|| ResponseError::Forbidden("passkey verification failed".to_owned()))?;
  if user_unique_id != uuid::Uuid::from_u64_pair(item.user_id as u64, 0) {
    warn!(
      passkey_id=%item.id,
      user_id=%item.user_id,
      "passkey user handle does not match the stored credential owner"
    );
    return Err(ResponseError::Forbidden(
      "passkey verification failed".to_owned(),
    ));
  }
  let mut key = passkey_from_model(&item)
    .ok_or_else(|| ResponseError::NotFound("passkey credential".to_owned()))?;

  let result = match webauthn.finish_discoverable_authentication(
    &body.credential,
    state,
    &[DiscoverableKey::from(&key)],
  ) {
    Ok(result) => result,
    Err(err) => return Err(webauthn_error(err)),
  };
  cache.at("passkey-login").del(&credential_key).await.ok();
  let key_user = user::get(&db.conn, item.user_id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("passkey user".to_owned()))?;

  if key_user.banned || !key_user.permissions.0.contains(&Permission::Basic) {
    warn!(id=%key_user.id, account=%key_user.account, "account is banned");
    return Err(ResponseError::Forbidden("account is banned".to_owned()));
  }

  // persist the (possibly) bumped counter so cloned credentials get detected
  let counter_changed = key.update_credential(&result) == Some(true);
  let item = passkey::Model {
    registration: if counter_changed {
      serde_json::to_value(&key)?
    } else {
      item.registration.clone()
    },
    last_used_at: Some(Utc::now()),
    ..item
  };
  passkey::update(&db.conn, item.id, item.clone()).await.ok();

  info!(
    id=%key_user.id,
    account=%key_user.account,
    nickname=%key_user.nickname,
    passkey_id=%item.id,
    "user logged in via passkey"
  );

  *(token_tracker.token.lock().await) = Token {
    id: key_user.id,
    account: key_user.account.clone(),
    nickname: key_user.nickname.clone(),
    permissions: key_user.permissions,
    ..Default::default()
  };
  token_tracker
    .renew_requested
    .store(true, std::sync::atomic::Ordering::Relaxed);

  Ok(StatusCode::OK)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn uuid_of_user_id_is_stable() {
    let a = uuid::Uuid::from_u64_pair(42, 0);
    let b = uuid::Uuid::from_u64_pair(42, 0);
    let c = uuid::Uuid::from_u64_pair(43, 0);
    assert_eq!(a, b);
    assert_ne!(a, c);
  }

  #[test]
  fn build_webauthn_accepts_localhost_http_origin() {
    let config = config::Model {
      server: Some(r2s_config::server::Config {
        external_domain: "localhost".to_owned(),
        external_https: false,
        ..Default::default()
      }),
      ..Default::default()
    };
    assert!(build_webauthn(&config).is_ok());
  }

  #[test]
  fn build_webauthn_derives_rp_id_from_pinned_port_origin() {
    // the origin carries the port, the relying party id must not
    let config = config::Model {
      server: Some(r2s_config::server::Config {
        external_domain: "localhost:8088".to_owned(),
        external_https: false,
        ..Default::default()
      }),
      ..Default::default()
    };
    assert!(build_webauthn(&config).is_ok());
  }

  #[test]
  fn build_webauthn_rejects_missing_server_config() {
    let config = config::Model {
      server: None,
      ..Default::default()
    };
    assert!(build_webauthn(&config).is_err());
  }
}

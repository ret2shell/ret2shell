use axum::{
  Extension, Router,
  extract::{Request, State},
  http::Uri,
  middleware,
  response::IntoResponse,
  routing::any,
};
use r2s_config::GlobalConfig;
use r2s_database::{game, user::Permission};
use r2s_migrator::Database;
use tracing::{debug, info};

use crate::{
  middleware::auth::{self, Token},
  traits::{GlobalState, HTTPClient, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .route("/", any(proxy_to_registry))
    .route("/{*path}", any(proxy_to_registry))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      Permission::Game
    )))
}

async fn proxy_to_registry(
  State(config): State<GlobalConfig>, State(ref db): State<Database>,
  State(client): State<HTTPClient>, Extension(token): Extension<Token>, mut req: Request,
) -> Result<impl IntoResponse, ResponseError> {
  debug!("Proxying frontend request: {:?}", req);
  let registry_config = config.cluster.clone().and_then(|v| v.registry);
  let (protocol, registry_url) = match registry_config {
    Some(c) => {
      if c.insecure {
        ("http", c.server)
      } else {
        ("https", c.server)
      }
    }
    None => {
      return Err(ResponseError::PreconditionFailed(String::from(
        "internal registry is not enabled, please contact the website devops",
      )));
    }
  };
  let path = req.uri().path();
  let path_query = req
    .uri()
    .path_and_query()
    .map(|pq| pq.as_str())
    .unwrap_or(path);

  let path = path.trim_start_matches("/");
  let path_query = path_query.trim_start_matches("/");

  debug!("Proxying frontend path with query: /{path_query}");

  // if path is not starts with v2, not implemented yet
  if !path.starts_with("v2") {
    return Err(ResponseError::BadRequest(format!(
      "invalid registry path: {path}"
    )));
  }

  let is_auth_path = path.trim_matches('/') == "v2";
  if is_auth_path {
    let resp = axum::response::Response::builder()
      .status(200)
      .body("OK".to_string())
      .unwrap();
    return Ok(resp.into_response());
  }

  if !token.permissions.0.contains(&Permission::DevOps) {
    let repo = match path.strip_prefix("/v2/").unwrap().split('/').next() {
      Some(repo) => repo,
      None => {
        return Err(ResponseError::BadRequest(
          "invalid registry path".to_string(),
        ));
      }
    };

    let game = match game::get_by_bucket(&db.conn, repo).await? {
      Some(game) => game,
      None => {
        return Err(ResponseError::NotFound(format!(
          "game scope {repo} not found"
        )));
      }
    };

    if !game.admins.0.contains(&token.id) {
      return Err(ResponseError::Forbidden(
        "access denied".to_string(),
        format!(
          "user {}:{} ({}) is not allowed to access game scope {}",
          token.id, token.account, token.nickname, repo
        ),
      ));
    }

    info!(
      "game admin {}:{} ({}) pushed {} to game scope {}",
      token.id,
      token.account,
      token.nickname,
      path_query.strip_prefix(repo).unwrap_or(path_query),
      repo
    );
  } else {
    info!(
      "devops {}:{} ({}) operate registry with path {}",
      token.id, token.account, token.nickname, path_query
    );
  }

  let uri = format!(
    "{}://{}/{}",
    protocol,
    registry_url.trim_matches('/'),
    path_query
  );
  debug!("Proxying to registry url: {}", uri);
  *req.uri_mut() = Uri::try_from(uri)
    .map_err(|err| ResponseError::BadRequest(format!("invalid registry uri: {err}")))?;
  //req.headers_mut().remove("host");

  let resp = client
    .request(req)
    .await
    .map_err(|err| ResponseError::BadRequest(format!("registry proxy failed: {err}")))?;
  debug!("Proxying registry request: {:?}", resp);
  Ok(resp.into_response())
}

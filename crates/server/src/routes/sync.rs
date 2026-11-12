use axum::{Json, Router, extract::State, response::IntoResponse, routing::post};
use r2s_database::game;
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::{
  middleware::auth::sync_policy_allows,
  traits::{GlobalState, ResponseError},
};

/// Source-instance discovery request. The sync token travels in the request
/// body so it never lands in URLs, logs, or referrers.
#[derive(Deserialize)]
struct DiscoverRequest {
  token: String,
}

/// Capabilities advertised by this instance for remote sync consumers.
#[derive(Serialize)]
struct SyncCapabilities {
  git: bool,
  media: bool,
}

/// Descriptor of a game exposed for instance sync, anchored on the real
/// bucket id of this instance.
#[derive(Serialize)]
struct SyncDescriptor {
  bucket_id: String,
  /// Full commit hash of the current repository HEAD. Callers must pin it as
  /// the admission head and verify the cloned content against it.
  head: String,
  name: String,
  avatar: Option<String>,
  description: String,
  host_type: game::HostType,
  access_policy_sync: i32,
  /// Absolute path (including the api base path) of the game Git endpoint on
  /// this instance, e.g. `/api/game/3/repo/<bucket_id>.git`.
  repository_path: String,
  capabilities: SyncCapabilities,
}

fn repository_path(api_base_path: &str, game_id: i64, bucket_id: &str) -> String {
  format!(
    "{}/game/{}/repo/{bucket_id}.git",
    api_base_path.trim_end_matches('/'),
    game_id
  )
}

async fn discover(
  State(state): State<GlobalState>, Json(request): Json<DiscoverRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  let token = request.token.trim();
  if token.is_empty() || token.len() > 512 {
    return Err(ResponseError::BadRequest("invalid sync token".to_owned()));
  }
  let game = game::get_by_token(&state.db.conn, token)
    .await?
    .ok_or_else(|| ResponseError::Unauthorized("invalid sync token".to_owned()))?;
  if !sync_policy_allows(&game.host_type, game.archived(), game.access_policy.sync) {
    warn!(game_id = game.id, "rejected sync discovery by policy");
    return Err(ResponseError::Forbidden(
      "the source game does not allow sync".to_owned(),
    ));
  }
  let bucket_id = game
    .bucket
    .clone()
    .ok_or_else(|| ResponseError::PreconditionFailed("game bucket not found".to_owned()))?;
  let game_bucket = state.bucket.at(&bucket_id).await?;
  let head = game_bucket.git.get_head().await.map_err(|error| {
    warn!(
      game_id = game.id,
      ?error,
      "failed to resolve the source HEAD"
    );
    ResponseError::PreconditionFailed("failed to resolve the source HEAD".to_owned())
  })?;
  let api_base_path = state
    .config
    .server
    .as_ref()
    .map(|server| server.api_base_path.as_str())
    .unwrap_or("/api");
  let path = repository_path(api_base_path, game.id, &bucket_id);
  Ok(Json(SyncDescriptor {
    bucket_id,
    head,
    name: game.name,
    avatar: game.logo,
    description: game.brief,
    host_type: game.host_type,
    access_policy_sync: game.access_policy.sync,
    repository_path: path,
    capabilities: SyncCapabilities {
      git: true,
      media: true,
    },
  }))
}

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
  Router::new().route("/discover", post(discover))
}

#[cfg(test)]
mod tests {
  use super::repository_path;

  #[test]
  fn repository_path_includes_the_api_base_and_bucket() {
    assert_eq!(
      repository_path("/api", 3, "the_bucket"),
      "/api/game/3/repo/the_bucket.git"
    );
    assert_eq!(repository_path("/api/", 7, "b"), "/api/game/7/repo/b.git");
  }
}

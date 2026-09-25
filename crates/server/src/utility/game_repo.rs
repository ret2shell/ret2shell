use r2s_bucket::BucketError;
use r2s_cache::CacheError;
use r2s_database::game;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use thiserror::Error;
use tracing::{error, info, warn};

use crate::traits::GlobalState;

/// Errors of the background game repo path index refresh. The messages match
/// the former anyhow context strings so the worker warnings stay identical.
#[derive(Debug, Error)]
enum RepoIndexError {
  #[error("failed to open bucket `{bucket}` for repo index refresh")]
  OpenBucket {
    bucket: String,
    #[source]
    source: BucketError,
  },
  #[error("failed to read head for bucket `{bucket}`")]
  ReadHead {
    bucket: String,
    #[source]
    source: BucketError,
  },
  #[error("failed to build repo path index for bucket `{bucket}`")]
  BuildIndex {
    bucket: String,
    #[source]
    source: BucketError,
  },
  #[error(transparent)]
  Cache(#[from] CacheError),
}

pub(crate) const GAME_REPO_INDEX_CACHE_TTL: i64 = 60 * 60 * 24;
const GAME_REPO_INDEX_REFRESH_LOCK_TTL: i64 = 60 * 5;

pub(crate) fn game_repo_index_cache_key(game_id: i64, head: &str) -> String {
  format!("{game_id}:{head}")
}

fn game_repo_index_refresh_key(game_id: i64) -> String {
  game_id.to_string()
}

pub(crate) async fn schedule_game_repo_index_refresh(
  state: &GlobalState, game_id: i64, bucket_name: impl AsRef<str>,
) {
  let bucket_name = bucket_name.as_ref().to_owned();
  let refresh_key = game_repo_index_refresh_key(game_id);
  let refresh_cache = state.cache.at("game-repo-index-refresh");

  match refresh_cache.exists(&refresh_key).await {
    Ok(true) => return,
    Ok(false) => {}
    Err(err) => {
      warn!(game_id, bucket=%bucket_name, error=?err, "failed to read game repo index refresh lock");
      return;
    }
  }

  if let Err(err) = refresh_cache
    .set_ex(&refresh_key, true, GAME_REPO_INDEX_REFRESH_LOCK_TTL)
    .await
  {
    warn!(game_id, bucket=%bucket_name, error=?err, "failed to write game repo index refresh lock");
    return;
  }

  let state = state.clone();
  tokio::spawn(async move {
    if let Err(err) = refresh_game_repo_index(&state, game_id, &bucket_name).await {
      error!(game_id, bucket=%bucket_name, error=?err, "failed to refresh game repo index");
    }
    state
      .cache
      .at("game-repo-index-refresh")
      .del(game_repo_index_refresh_key(game_id))
      .await
      .ok();
  });
}

pub(crate) async fn schedule_next_missing_game_repo_index_refresh(state: &GlobalState) {
  let games = match game::Entity::find()
    .filter(game::Column::Bucket.is_not_null())
    .all(&state.db.conn)
    .await
  {
    Ok(games) => games,
    Err(err) => {
      warn!(error=?err, "failed to load games for repo index refresh");
      return;
    }
  };

  let cache = state.cache.at("game-repo-index");
  for game in games {
    let Some(bucket_name) = game.bucket.as_deref() else {
      continue;
    };

    let game_bucket = match state.bucket.at(bucket_name).await {
      Ok(game_bucket) => game_bucket,
      Err(err) => {
        warn!(game_id=game.id, bucket=%bucket_name, error=?err, "failed to open game bucket for repo index refresh");
        continue;
      }
    };
    let head = match game_bucket.git.get_head().await {
      Ok(head) => head,
      Err(err) => {
        warn!(game_id=game.id, bucket=%bucket_name, error=?err, "failed to read game repo head for repo index refresh");
        continue;
      }
    };

    match cache
      .exists(game_repo_index_cache_key(game.id, &head))
      .await
    {
      Ok(true) => continue,
      Ok(false) => {
        schedule_game_repo_index_refresh(state, game.id, bucket_name).await;
        return;
      }
      Err(err) => {
        warn!(game_id=game.id, bucket=%bucket_name, error=?err, "failed to read game repo index cache");
      }
    }
  }
}

async fn refresh_game_repo_index(
  state: &GlobalState, game_id: i64, bucket_name: &str,
) -> Result<(), RepoIndexError> {
  let game_bucket =
    state
      .bucket
      .at(bucket_name)
      .await
      .map_err(|source| RepoIndexError::OpenBucket {
        bucket: bucket_name.to_owned(),
        source,
      })?;
  let head = game_bucket
    .git
    .get_head()
    .await
    .map_err(|source| RepoIndexError::ReadHead {
      bucket: bucket_name.to_owned(),
      source,
    })?;
  let cache_key = game_repo_index_cache_key(game_id, &head);
  let cache = state.cache.at("game-repo-index");
  if cache.exists(&cache_key).await? {
    return Ok(());
  }

  info!(game_id, bucket=%bucket_name, head=%head, "building game repo path index");
  let index = game_bucket
    .git
    .build_path_index(&head)
    .await
    .map_err(|source| RepoIndexError::BuildIndex {
      bucket: bucket_name.to_owned(),
      source,
    })?;
  cache
    .set_ex(&cache_key, &index, GAME_REPO_INDEX_CACHE_TTL)
    .await?;
  Ok(())
}

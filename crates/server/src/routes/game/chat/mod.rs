use axum::{
  Extension, Json, Router,
  extract::{Query, State},
  middleware,
  response::IntoResponse,
  routing::get,
};
use r2s_database::{challenge, chat, game, team, user};
use r2s_event::{
  Event,
  events::{ChatEvent, ChatEventType, EventContainer},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use serde::{Deserialize, Serialize};
use tower_http::request_id::RequestId;
use tracing::warn;

use crate::{
  middleware::{
    auth::{self, Token},
    data,
  },
  traits::{GlobalState, ResponseError},
  utility::pagination::{
    CHAT_SYNC_CONTEXT_SIZE, DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_CHAT_SESSION_LIMIT,
    DEFAULT_CHAT_SYNC_LIMIT, page_size,
  },
};

/// Per-user cap on unanswered messages in a hammer chat session; enforced by
/// `player_send_chat` and reported as `remaining` by `player_get_chat_session`.
const CHAT_REPLY_MESSAGE_LIMIT: u64 = 3;

fn ensure_challenge_in_game(
  game: &game::Model, challenge: &challenge::Model,
) -> Result<(), ResponseError> {
  if game.id != challenge.game_id {
    warn!(
      game_id=%game.id,
      challenge_id=%challenge.id,
      challenge_game_id=%challenge.game_id,
      "challenge does not belong to game",
    );
    return Err(ResponseError::NotFound("challenge not found".to_owned()));
  }
  Ok(())
}

async fn get_chat_session_resources(
  db: &Database, game: &game::Model, team_id: i64, challenge_id: i64,
) -> Result<(team::Model, challenge::Model), ResponseError> {
  let team = team::get(&db.conn, team_id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  if game.id != team.game_id {
    warn!(
      game_id=%game.id,
      team_id=%team.id,
      team_game_id=%team.game_id,
      "chat session team does not belong to game",
    );
    return Err(ResponseError::NotFound("team not found".to_owned()));
  }

  let challenge = challenge::get(&db.conn, challenge_id)
    .await?
    .ok_or_else(|| ResponseError::NotFound("challenge not found".to_owned()))?;
  ensure_challenge_in_game(game, &challenge)?;
  Ok((team, challenge))
}

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .nest(
      "/admin",
      Router::new()
        .route("/", get(admin_get_chat_list))
        .route(
          "/session",
          get(admin_get_chat_session).post(admin_send_chat),
        )
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          auth::game_admin_required,
        )),
    )
    .nest(
      "/{challenge}",
      Router::new()
        .route("/", get(player_get_chat_session).post(player_send_chat))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(challenge, true, id, name),
        )),
    )
    .route("/unread", get(check_unread_chats))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      auth::game_access_required,
    ))
    .route_layer(middleware::from_fn(auth::permission_required_all!(
      user::Permission::Basic,
      user::Permission::Verified
    )))
}

#[derive(Deserialize)]
struct SendChatRequest {
  content: String,
}

#[derive(Deserialize, Default, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum ChatFetchMode {
  /// Newest `limit` messages.
  #[default]
  Latest,
  /// `limit` messages older than `before_id` (history paging).
  Before,
  /// Read context plus every message newer than `after_id` (continuous sync).
  Sync,
}

#[derive(Deserialize)]
struct ChatMessageQuery {
  mode: Option<ChatFetchMode>,
  after_id: Option<i64>,
  before_id: Option<i64>,
  limit: Option<u64>,
}

#[derive(Deserialize)]
struct ChatSessionListQuery {
  challenge_id: Option<i64>,
  cursor: Option<i64>,
  limit: Option<u64>,
}

#[derive(Serialize)]
struct ChatMessagePage {
  items: Vec<chat::ExModel>,
  has_more: bool,
  /// Read watermark for rendering; `None` for mode=before.
  checked_through_id: Option<i64>,
  /// Player send quota; always `None` on the admin endpoint.
  remaining: Option<u64>,
}

#[derive(Serialize)]
struct ChatSessionPage {
  items: Vec<chat::SessionModel>,
  has_more: bool,
  next_cursor: Option<i64>,
}

async fn admin_get_chat_list(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<ChatSessionListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.hammer_policy.enabled {
    return Err(ResponseError::PreconditionFailed(
      "hammer is not enabled".into(),
    ));
  }
  if let Some(challenge_id) = query.challenge_id {
    let _ = challenge::get(&db.conn, challenge_id)
      .await?
      .ok_or_else(|| ResponseError::NotFound("challenge not found".to_owned()))
      .and_then(|challenge| {
        ensure_challenge_in_game(&game, &challenge)?;
        Ok(challenge)
      })?;
  }
  let limit = page_size(query.limit, DEFAULT_CHAT_SESSION_LIMIT);
  let (items, has_more) =
    chat::get_sessions_page(&db.conn, game.id, query.challenge_id, query.cursor, limit).await?;
  let next_cursor = if has_more {
    items.last().map(|s| s.last_message_id)
  } else {
    None
  };
  Ok(Json(ChatSessionPage {
    items,
    has_more,
    next_cursor,
  }))
}

/// Fetch one message page for a session, dispatching on the fetch mode.
///
/// * `latest`: the newest `limit` messages.
/// * `before`: `limit` messages with `id < before_id`; a missing `before_id`
///   falls back to the newest page so a malformed request stays bounded.
/// * `sync`: the newest `CHAT_SYNC_CONTEXT_SIZE` messages with `id <= after_id`
///   (read context) followed by every message with `id > after_id`, capped at
///   `limit`; a missing `after_id` means 0. The cursor is always client-owned:
///   the session-wide `checked` watermark must never be used as the anchor,
///   because a teammate marking the session read would move it past messages
///   this client has not fetched yet.
///
/// `items` is always ascending by id; `has_more` means more rows exist beyond
/// the slice in the direction of travel (for `sync`: more messages newer than
/// `after_id`, to be drained by re-syncing from the last returned id).
async fn fetch_chat_page(
  db: &Database, team_id: i64, challenge_id: i64, mode: ChatFetchMode, after_id: Option<i64>,
  before_id: Option<i64>, limit: u64,
) -> Result<(Vec<chat::ExModel>, bool), ResponseError> {
  match mode {
    ChatFetchMode::Latest => {
      chat::get_list_page(&db.conn, team_id, challenge_id, None, None, limit)
        .await
        .map_err(Into::into)
    }
    ChatFetchMode::Before => {
      chat::get_list_page(&db.conn, team_id, challenge_id, None, before_id, limit)
        .await
        .map_err(Into::into)
    }
    ChatFetchMode::Sync => {
      let after_id = after_id.unwrap_or(0);
      let (mut context, _) = chat::get_list_page(
        &db.conn,
        team_id,
        challenge_id,
        None,
        Some(after_id.saturating_add(1)),
        CHAT_SYNC_CONTEXT_SIZE,
      )
      .await?;
      let (unread, has_more) =
        chat::get_list_page(&db.conn, team_id, challenge_id, Some(after_id), None, limit).await?;
      context.extend(unread);
      Ok((context, has_more))
    }
  }
}

async fn player_get_chat_session(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(challenge): Extension<challenge::Model>, Extension(game): Extension<game::Model>,
  Extension(team): Extension<Option<team::Model>>, Query(query): Query<ChatMessageQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.hammer_policy.enabled {
    return Err(ResponseError::PreconditionFailed(
      "hammer is not enabled".into(),
    ));
  }
  ensure_challenge_in_game(&game, &challenge)?;
  let team = team.ok_or_else(|| {
    warn!("user want to access chat session without participate game");
    ResponseError::Forbidden("team not found".into())
  })?;
  let mode = query.mode.unwrap_or_default();
  let limit = page_size(
    query.limit,
    match mode {
      ChatFetchMode::Sync => DEFAULT_CHAT_SYNC_LIMIT,
      _ => DEFAULT_CHAT_MESSAGE_LIMIT,
    },
  );
  let (chats, has_more) = fetch_chat_page(
    db,
    team.id,
    challenge.id,
    mode,
    query.after_id,
    query.before_id,
    limit,
  )
  .await?;
  // mark read only when loading the newest messages (latest/sync), never when
  // paging into older history (before)
  if mode != ChatFetchMode::Before && chats.last().is_some_and(|c| c.is_admin && !c.checked) {
    chat::mark_checked(&db.conn, team.id, challenge.id).await?;
  }
  // computed after the mark so the response is self-consistent
  let checked_through_id = if mode == ChatFetchMode::Before {
    None
  } else {
    chat::get_checked_through_id(&db.conn, team.id, challenge.id).await?
  };
  let pending = chat::count_pending_messages(&db.conn, team.id, challenge.id, token.id).await?;
  Ok(Json(ChatMessagePage {
    items: chats,
    has_more,
    checked_through_id,
    remaining: Some(CHAT_REPLY_MESSAGE_LIMIT.saturating_sub(pending)),
  }))
}

#[allow(clippy::too_many_arguments)]
async fn player_send_chat(
  State(ref db): State<Database>, State(ref queue): State<Queue>,
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
  Extension(challenge): Extension<challenge::Model>, Extension(trace): Extension<RequestId>,
  Extension(team): Extension<Option<team::Model>>, Json(chat): Json<SendChatRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.hammer_policy.enabled {
    return Err(ResponseError::PreconditionFailed(
      "hammer is not enabled".into(),
    ));
  }
  ensure_challenge_in_game(&game, &challenge)?;
  let team = team.ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  let pending = chat::count_pending_messages(&db.conn, team.id, challenge.id, token.id).await?;
  if pending >= CHAT_REPLY_MESSAGE_LIMIT {
    warn!("user try to send multiple chats",);
    return Err(ResponseError::TooManyRequests(
      "please wait for administrator's reply".into(),
    ));
  }
  chat::create(
    &db.conn,
    chat::Model {
      team_id: team.id,
      challenge_id: challenge.id,
      user_id: token.id,
      content: chat.content.clone(),
      game_id: challenge.game_id,
      checked: false,
      ..Default::default()
    },
  )
  .await?;
  let event = EventContainer {
    game_id: game.id,
    event: Event::Chat(Box::new(ChatEvent {
      operator: user::Model {
        id: token.id,
        account: token.account.clone(),
        nickname: token.nickname.clone(),
        ..Default::default()
      },
      team,
      challenge,
      event_type: ChatEventType::Message,
      content: chat.content,
    })),
  };
  queue
    .publish(
      "event",
      event,
      &trace.header_value().to_str().unwrap_or("UNKNOWN"),
    )
    .await
    .ok();

  Ok(())
}

#[derive(Deserialize)]
struct AdminSessionQuery {
  team_id: i64,
  challenge_id: i64,
}

#[derive(Deserialize)]
struct AdminSessionMessagesQuery {
  team_id: i64,
  challenge_id: i64,
  mode: Option<ChatFetchMode>,
  after_id: Option<i64>,
  before_id: Option<i64>,
  limit: Option<u64>,
}

async fn admin_get_chat_session(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<AdminSessionMessagesQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.hammer_policy.enabled {
    return Err(ResponseError::PreconditionFailed(
      "hammer is not enabled".into(),
    ));
  }
  let _ = get_chat_session_resources(db, &game, query.team_id, query.challenge_id).await?;
  let mode = query.mode.unwrap_or_default();
  let limit = page_size(
    query.limit,
    match mode {
      ChatFetchMode::Sync => DEFAULT_CHAT_SYNC_LIMIT,
      _ => DEFAULT_CHAT_MESSAGE_LIMIT,
    },
  );
  let (chats, has_more) = fetch_chat_page(
    db,
    query.team_id,
    query.challenge_id,
    mode,
    query.after_id,
    query.before_id,
    limit,
  )
  .await?;
  // mark read only when loading the newest messages (latest/sync), never when
  // paging into older history (before)
  if mode != ChatFetchMode::Before && chats.last().is_some_and(|c| !c.is_admin && !c.checked) {
    chat::mark_checked(&db.conn, query.team_id, query.challenge_id).await?;
  }
  // computed after the mark so the response is self-consistent
  let checked_through_id = if mode == ChatFetchMode::Before {
    None
  } else {
    chat::get_checked_through_id(&db.conn, query.team_id, query.challenge_id).await?
  };
  Ok(Json(ChatMessagePage {
    items: chats,
    has_more,
    checked_through_id,
    remaining: None,
  }))
}

async fn admin_send_chat(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Extension(game): Extension<game::Model>, Query(query): Query<AdminSessionQuery>,
  Json(chat): Json<SendChatRequest>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.hammer_policy.enabled {
    return Err(ResponseError::PreconditionFailed(
      "hammer is not enabled".into(),
    ));
  }
  let (team, challenge) =
    get_chat_session_resources(db, &game, query.team_id, query.challenge_id).await?;
  chat::create(
    &db.conn,
    chat::Model {
      team_id: team.id,
      challenge_id: challenge.id,
      user_id: token.id,
      content: chat.content,
      game_id: game.id,
      checked: false,
      is_admin: true,
      ..Default::default()
    },
  )
  .await?;
  Ok(())
}

async fn check_unread_chats(
  State(ref db): State<Database>, Extension(team): Extension<Option<team::Model>>,
  Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.hammer_policy.enabled {
    return Err(ResponseError::PreconditionFailed(
      "hammer is not enabled".into(),
    ));
  }
  let team = team.ok_or_else(|| ResponseError::NotFound("team not found".to_owned()))?;
  // team should check admin's message, so we should filter is_admin == true
  let chats = chat::get_unchecked(&db.conn, team.id, true).await?;
  Ok(Json(chats))
}

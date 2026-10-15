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
  utility::pagination::{DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_CHAT_SESSION_LIMIT, page_size},
};

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

#[derive(Deserialize)]
struct ChatMessageQuery {
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

async fn player_get_chat_session(
  State(ref db): State<Database>, Extension(challenge): Extension<challenge::Model>,
  Extension(game): Extension<game::Model>, Extension(team): Extension<Option<team::Model>>,
  Query(query): Query<ChatMessageQuery>,
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
  let limit = page_size(query.limit, DEFAULT_CHAT_MESSAGE_LIMIT);
  let (chats, has_more) = chat::get_list_page(
    &db.conn,
    team.id,
    challenge.id,
    query.after_id,
    query.before_id,
    limit,
  )
  .await?;
  // mark read only for the newest page (not when paging into older history)
  if query.before_id.is_none() && chats.last().is_some_and(|c| c.is_admin && !c.checked) {
    chat::mark_checked(&db.conn, team.id, challenge.id).await?;
  }
  Ok(Json(ChatMessagePage {
    items: chats,
    has_more,
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
  if pending >= 3 {
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
  after_id: Option<i64>,
  before_id: Option<i64>,
  limit: Option<u64>,
}

async fn admin_get_chat_session(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Query(query): Query<AdminSessionQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  if !game.hammer_policy.enabled {
    return Err(ResponseError::PreconditionFailed(
      "hammer is not enabled".into(),
    ));
  }
  let _ = get_chat_session_resources(db, &game, query.team_id, query.challenge_id).await?;
  let limit = page_size(query.limit, DEFAULT_CHAT_MESSAGE_LIMIT);
  let (chats, has_more) = chat::get_list_page(
    &db.conn,
    query.team_id,
    query.challenge_id,
    query.after_id,
    query.before_id,
    limit,
  )
  .await?;
  if query.before_id.is_none() && chats.last().is_some_and(|c| !c.is_admin && !c.checked) {
    chat::mark_checked(&db.conn, query.team_id, query.challenge_id).await?;
  }
  Ok(Json(ChatMessagePage {
    items: chats,
    has_more,
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

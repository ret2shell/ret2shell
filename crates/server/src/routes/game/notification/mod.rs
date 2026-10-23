use axum::{
  Extension, Json, Router,
  extract::State,
  middleware,
  response::IntoResponse,
  routing::{delete, get, post},
};
use chrono::Utc;
use r2s_database::{game, notification, user};
use r2s_event::{
  Event,
  events::{EventContainer, GameEvent, GameEventType},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use tower_http::request_id::RequestId;

use crate::{
  middleware::{
    auth::{self, Token},
    data,
  },
  traits::{GlobalState, ResponseError},
};

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .nest(
      "/{notification}",
      Router::new()
        .route("/", delete(delete_notification))
        .route_layer(middleware::from_fn_with_state(
          state.clone(),
          data::prepare_data!(notification, false, id, title),
        )),
    )
    .route("/", post(create_notification))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      auth::game_admin_required,
    ))
    .route("/", get(get_notifications))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      auth::game_access_required,
    ))
}

async fn get_notifications(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let notifications = notification::get_list_ex(&db.conn, game.id).await?;
  Ok(Json(notifications))
}

async fn create_notification(
  State(ref db): State<Database>, State(ref queue): State<Queue>,
  Extension(game): Extension<game::Model>, Extension(token): Extension<Token>,
  Extension(trace): Extension<RequestId>, Json(notification): Json<notification::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let notification = notification::create(
    &db.conn,
    notification::Model {
      id: 0,
      game_id: game.id,
      published_at: Utc::now(),
      publisher_id: token.id,
      ..notification
    },
  )
  .await?;
  let event = EventContainer {
    game_id: game.id,
    event: Event::Game(Box::new(GameEvent {
      event_type: GameEventType::NewNotification,
      operator: user::Model {
        id: token.id,
        nickname: token.nickname.clone(),
        account: token.account.clone(),
        ..Default::default()
      },
      message: notification.title.clone(),
    })),
  };
  queue
    .publish(
      "event",
      event,
      &trace.header_value().to_str().unwrap_or("UNKNOWN"),
    )
    .await?;
  Ok(Json(notification))
}

async fn delete_notification(
  State(ref db): State<Database>, Extension(game): Extension<game::Model>,
  Extension(notification): Extension<notification::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.id != notification.game_id {
    return Err(ResponseError::NotFound("notification not found".to_owned()));
  }
  notification::delete(&db.conn, notification.id).await?;
  Ok(())
}

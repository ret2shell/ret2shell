use axum::{
    extract::State,
    middleware,
    response::IntoResponse,
    routing::{delete, get, post},
    Extension, Json, Router,
};
use chrono::Utc;
use r2s_database::{game, notification};
use r2s_migrator::Database;

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
            "/:notification",
            Router::new()
                .route("/", delete(delete_notification))
                .route_layer(middleware::from_fn_with_state(
                    state.clone(),
                    data::prepare_data!(notification, false),
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
    State(ref db): State<Database>, Extension(game): Extension<game::Model>,
    Extension(token): Extension<Token>, Json(notification): Json<notification::Model>,
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
    Ok(Json(notification))
}

async fn delete_notification(
    State(ref db): State<Database>, Extension(notification): Extension<notification::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    notification::delete(&db.conn, notification.id).await?;
    Ok(())
}

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Extension, Router,
};
use r2s_database::user;
use r2s_migrator::Database;
use serde::Deserialize;

use crate::{
    middleware::auth::Token,
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new().route("/", get(get_user_list))
}

#[derive(Deserialize)]
struct UserListQuery {
    page: Option<u64>,
    page_size: Option<u64>,
    order: Option<String>,
    filter: Option<String>,
    with_institute_id: Option<i64>,
}

async fn get_user_list(
    State(ref db): State<Database>, Extension(token): Extension<Token>,
    Query(query): Query<UserListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
    let results = user::get_page(
        &db.conn,
        query.page.unwrap_or(1),
        query.page_size.unwrap_or(15),
        query.order,
        query.filter,
        token.permissions.0.contains(&user::Permission::User),
        query.with_institute_id,
    )
    .await?;
    Ok(axum::Json(results))
}

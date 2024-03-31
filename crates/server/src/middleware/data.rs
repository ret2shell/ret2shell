use axum::{
    extract::{Request, State},
    middleware::Next,
    response::IntoResponse,
    Extension,
};
use r2s_cache::Cache;
use r2s_config::GlobalConfig;
use r2s_migrator::Database;

use super::auth::Token;
use crate::traits::ResponseError;

pub async fn prepare_config(
    State(ref db): State<Database>, State(ref pool): State<Cache>,
    State(config): State<GlobalConfig>, mut req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
    match pool.at("platform").get("config").await? {
        Some(info) => {
            req.extensions_mut()
                .insert::<r2s_database::config::Model>(info);
        }
        None => {
            let dynamic_config = r2s_database::config::get(&db.conn).await?;
            let dynamic_config = dynamic_config.unwrap_or_default().merge(config);
            pool.at("platform").set("config", &dynamic_config).await?;
            req.extensions_mut()
                .insert::<r2s_database::config::Model>(dynamic_config);
        }
    }
    Ok(next.run(req).await)
}

pub async fn prepare_user_info(
    State(ref db): State<Database>, Extension(token): Extension<Token>, mut req: Request,
    next: Next,
) -> Result<impl IntoResponse, ResponseError> {
    let user = r2s_database::user::get(&db.conn, token.id).await?;
    match user {
        Some(user) => {
            req.extensions_mut()
                .insert::<r2s_database::user::Model>(user);
            Ok(next.run(req).await)
        }
        None => Err(ResponseError::Unauthorized("please login first".into())),
    }
}

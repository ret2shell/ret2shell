use axum::{
    extract::{Request, State},
    middleware::Next,
    response::IntoResponse,
    Extension,
};
use r2s_cache::Cache;
use r2s_config::GlobalConfig;
use r2s_migrator::Database;
use tracing::debug;

use super::auth::Token;
use crate::traits::ResponseError;

pub async fn prepare_config(
    State(ref db): State<Database>, State(ref cache): State<Cache>,
    State(config): State<GlobalConfig>, mut req: Request, next: Next,
) -> Result<impl IntoResponse, ResponseError> {
    match cache.at("platform").get("config").await? {
        Some(info) => {
            req.extensions_mut()
                .insert::<r2s_database::config::Model>(info);
        }
        None => {
            let dynamic_config = r2s_database::config::get(&db.conn).await?;
            debug!("dynamic_config: {:?}", dynamic_config);
            debug!("static_config: {:?}", config);
            let dynamic_config = dynamic_config.unwrap_or_default().merge(config);
            cache.at("platform").set("config", &dynamic_config).await?;
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

macro_rules! get_path_param_i64 {
    ($key:expr, $params:expr) => {{
        let key = $params
            .get($key)
            .ok_or(crate::traits::ResponseError::PreconditionFailed(format!(
                "missing {}",
                $key
            )))?;
        let key = key.parse::<i64>().map_err(|_| {
            crate::traits::ResponseError::PreconditionFailed(format!("invalid {}", $key))
        })?;
        key
    }};
}

pub(crate) use get_path_param_i64;

macro_rules! prepare_data {
    ($model:tt) => {
        |axum::extract::State(db): axum::extract::State<r2s_migrator::Database>,
         axum::extract::State(cache): axum::extract::State<r2s_cache::Cache>,
         axum::extract::Path(params): axum::extract::Path<
            std::collections::HashMap<String, String>,
        >,
         mut req: axum::extract::Request,
         next: axum::middleware::Next| async move {
            let id = crate::middleware::data::get_path_param_i64!(stringify!($model), &params);
            let data = match cache.at(stringify!($model)).get(id).await? {
                Some(info) => Some(info),
                None => {
                    let data = r2s_database::$model::get(&db.conn, id).await?;
                    match data {
                        Some(data) => {
                            cache
                                .at(stringify!($model))
                                .set(id.to_string(), &data)
                                .await?;
                            Some(data)
                        }
                        None => None,
                    }
                }
            };
            match data {
                Some(data) => {
                    req.extensions_mut()
                        .insert::<r2s_database::$model::Model>(data);
                    Ok(next.run(req).await)
                }
                None => Err(crate::traits::ResponseError::NotFound(format!(
                    "{} not found",
                    stringify!($model)
                ))),
            }
        }
    };
}

pub(crate) use prepare_data;

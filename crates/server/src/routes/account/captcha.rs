use axum::{extract::State, response::IntoResponse, routing::get, Extension, Json, Router};
use r2s_cache::Cache;
use r2s_config::captcha::ValidatorType;
use r2s_database::config;

use crate::traits::{GlobalState, ResponseError};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/", get(get_captcha))
        .route("/cli", get(get_cli_captcha))
}

async fn get_captcha(
    State(ref cache): State<Cache>, Extension(config): Extension<config::Model>,
) -> Result<impl IntoResponse, ResponseError> {
    let captcha_config = config.captcha.ok_or(ResponseError::InternalServerError(
        "missing captcha config".to_owned(),
        "".to_owned(),
    ))?;
    if !captcha_config.enabled {
        return Ok(Json(r2s_captcha::generate(&ValidatorType::None, 0).await?));
    }
    let captcha = r2s_captcha::generate(
        &captcha_config.validator,
        captcha_config.difficulty.unwrap_or(4),
    )
    .await?;
    cache
        .at("captcha")
        .set_ex(&captcha.id, captcha.clone(), 60 * 5)
        .await?;
    Ok(Json(captcha))
}

async fn get_cli_captcha(State(cache): State<Cache>) -> Result<impl IntoResponse, ResponseError> {
    let captcha = r2s_captcha::generate(&ValidatorType::Pow, 4).await?;
    cache
        .at("captcha")
        .set_ex(&captcha.id, captcha.clone(), 60 * 5)
        .await?;
    Ok(Json(captcha))
}

use axum::{
  Extension, Json,
  extract::{Path, Query, State},
  http::{
    HeaderMap, StatusCode,
    header::{ACCEPT_LANGUAGE, LOCATION},
  },
  response::IntoResponse,
};
use nanoid::nanoid;
use r2s_bucket::{Bucket, game::GameDocument};
use r2s_cache::Cache;
use r2s_database::{
  challenge as challenge_db,
  game::{self, ArchivePolicy},
  user::{self, Permission},
};
use r2s_event::{
  Event,
  events::{EventContainer, GameEvent, GameEventType},
};
use r2s_migrator::Database;
use r2s_queue::Queue;
use sea_orm::TransactionTrait;
use serde::Deserialize;
use serde_json::Value;
use tower_http::request_id::RequestId;
use tracing::{info, warn};

use crate::{
  middleware::auth::{Token, is_game_admin},
  traits::ResponseError,
};

const GAME_DOC_CACHE_TTL: i64 = 60 * 5;
const DEFAULT_GAME_TRAINING_ZH_CN: &str = include_str!("./docs/training.zh_cn.md");
const DEFAULT_GAME_TRAINING_EN_US: &str = include_str!("./docs/training.en_us.md");
const DEFAULT_GAME_TRAINING_ZH_TW: &str = include_str!("./docs/training.zh_tw.md");
const DEFAULT_GAME_TRAINING_JA_JP: &str = include_str!("./docs/training.ja_jp.md");
const DEFAULT_GAME_RULES_ZH_CN: &str = include_str!("./docs/rules.zh_cn.md");
const DEFAULT_GAME_RULES_EN_US: &str = include_str!("./docs/rules.en_us.md");
const DEFAULT_GAME_RULES_ZH_TW: &str = include_str!("./docs/rules.zh_tw.md");
const DEFAULT_GAME_RULES_JA_JP: &str = include_str!("./docs/rules.ja_jp.md");

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum GameDocKind {
  Readme,
  Training,
  Rules,
}

impl GameDocKind {
  const fn as_bucket_document(self) -> GameDocument {
    match self {
      Self::Readme => GameDocument::Readme,
      Self::Training => GameDocument::Training,
      Self::Rules => GameDocument::Rules,
    }
  }

  const fn as_cache_segment(self) -> &'static str {
    match self {
      Self::Readme => "readme",
      Self::Training => "training",
      Self::Rules => "rules",
    }
  }

  const fn commit_message(self) -> &'static str {
    match self {
      Self::Readme => ":memo: update README.md",
      Self::Training => ":memo: update TRAINING.md",
      Self::Rules => ":memo: update RULES.md",
    }
  }

  const fn default_value(self, locale: GameDocLocale) -> &'static str {
    match self {
      Self::Readme => "",
      Self::Training => match locale {
        GameDocLocale::ZhCn => DEFAULT_GAME_TRAINING_ZH_CN,
        GameDocLocale::EnUs => DEFAULT_GAME_TRAINING_EN_US,
        GameDocLocale::ZhTw => DEFAULT_GAME_TRAINING_ZH_TW,
        GameDocLocale::JaJp => DEFAULT_GAME_TRAINING_JA_JP,
      },
      Self::Rules => match locale {
        GameDocLocale::ZhCn => DEFAULT_GAME_RULES_ZH_CN,
        GameDocLocale::EnUs => DEFAULT_GAME_RULES_EN_US,
        GameDocLocale::ZhTw => DEFAULT_GAME_RULES_ZH_TW,
        GameDocLocale::JaJp => DEFAULT_GAME_RULES_JA_JP,
      },
    }
  }
}

#[derive(Clone, Copy, Debug)]
enum GameDocLocale {
  ZhCn,
  EnUs,
  ZhTw,
  JaJp,
}

impl GameDocLocale {
  const fn as_cache_segment(self) -> &'static str {
    match self {
      Self::ZhCn => "zh_cn",
      Self::EnUs => "en_us",
      Self::ZhTw => "zh_tw",
      Self::JaJp => "ja_jp",
    }
  }

  fn from_headers(headers: &HeaderMap) -> Self {
    headers
      .get(ACCEPT_LANGUAGE)
      .and_then(|value| value.to_str().ok())
      .map(Self::from_str)
      .unwrap_or(Self::ZhCn)
  }

  fn from_str(value: &str) -> Self {
    match value
      .split(',')
      .next()
      .unwrap_or_default()
      .split(';')
      .next()
      .unwrap_or_default()
      .trim()
      .replace('-', "_")
      .to_lowercase()
      .as_str()
    {
      "en" | "en_us" => Self::EnUs,
      "zh" | "zh_cn" => Self::ZhCn,
      "zh_tw" => Self::ZhTw,
      "ja" | "ja_jp" => Self::JaJp,
      _ => Self::ZhCn,
    }
  }
}

fn game_doc_cache_key(game_id: i64, doc: GameDocKind, locale: GameDocLocale) -> String {
  format!(
    "{game_id}:{}:{}",
    doc.as_cache_segment(),
    locale.as_cache_segment()
  )
}

pub(crate) async fn invalidate_game_doc_cache(
  cache: &Cache, game_id: i64,
) -> Result<(), ResponseError> {
  let cache = cache.at("game-doc");
  for doc in [
    GameDocKind::Readme,
    GameDocKind::Training,
    GameDocKind::Rules,
  ] {
    for locale in [
      GameDocLocale::ZhCn,
      GameDocLocale::EnUs,
      GameDocLocale::ZhTw,
      GameDocLocale::JaJp,
    ] {
      cache.del(game_doc_cache_key(game_id, doc, locale)).await?;
    }
  }
  Ok(())
}

fn extract_legacy_intro_content(payload: Value) -> Result<String, ResponseError> {
  match payload {
    Value::String(content) => Ok(content),
    Value::Object(mut object) => match object.remove("content") {
      Some(Value::String(content)) => Ok(content),
      Some(Value::Null) | None => Ok(String::new()),
      _ => Err(ResponseError::BadRequest(
        "invalid introduction payload".to_owned(),
      )),
    },
    _ => Err(ResponseError::BadRequest(
      "invalid introduction payload".to_owned(),
    )),
  }
}

async fn persist_game_doc(
  cache: &Cache, bucket: &Bucket, game: &game::Model, token: &Token, doc: GameDocKind,
  content: &str,
) -> Result<String, ResponseError> {
  let game_bucket = super::get_game_bucket_mut(bucket, game).await?;
  game_bucket
    .write_document(doc.as_bucket_document(), content)
    .await?;
  game_bucket
    .commit(
      doc.commit_message(),
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  invalidate_game_doc_cache(cache, game.id).await?;
  info!(game_id=%game.id, doc=%doc.as_cache_segment(), "updated game document");

  Ok(content.to_owned())
}

#[derive(Deserialize)]
pub(super) struct GameListQuery {
  page: Option<u64>,
  page_size: Option<u64>,
  host_type: Option<game::HostType>,
  weight: Option<i32>,
}

pub(super) async fn get_game_list(
  State(ref db): State<Database>, Extension(token): Extension<Token>,
  Query(query): Query<GameListQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let results = game::get_page(
    &db.conn,
    query.page.unwrap_or(1),
    query.page_size.unwrap_or(15),
    query.host_type,
    query.weight,
    token.permissions.0.contains(&Permission::Host)
      || token.permissions.0.contains(&Permission::Game),
  )
  .await?;
  Ok(Json((
    results
      .0
      .iter()
      .filter(|g| !g.hidden || g.admins.0.contains(&token.id))
      .cloned()
      .collect::<Vec<_>>(),
    results.1,
  )))
}

pub(super) async fn get_game(
  Extension(token): Extension<Token>, Extension(game): Extension<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  if game.hidden && !is_game_admin!(token, game) {
    warn!("unauthorized user trying to get a hidden game");
    return Err(ResponseError::NotFound("game not found".to_owned()));
  }
  if is_game_admin!(token, game) {
    Ok(Json(game))
  } else {
    Ok(Json(game.desensitize()))
  }
}

pub(super) async fn create_game(
  State(ref db): State<Database>, State(ref bucket): State<Bucket>,
  Extension(token): Extension<Token>, Json(mut model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  let txn = db.conn.begin().await?;
  let game_bucket = bucket.create(serde_json::to_value(&model)?).await?;
  model.bucket = Some(game_bucket.name.clone());
  let model = game::create(
    &txn,
    game::Model {
      admins: game::Admins(vec![token.id]),
      introduction_id: None,
      token: Some(nanoid!()),
      sync_key: None,
      sync_token: (model.host_type == game::HostType::Game).then(|| nanoid!()),
      archive_policy: ArchivePolicy::default(),
      ..model
    },
  )
  .await;

  match model {
    Ok(model) => {
      txn.commit().await?;
      info!(game_id=%model.id, game_name=%model.name, "created game");
      Ok(Json(model))
    }
    Err(e) => {
      bucket.delete(&game_bucket.name).await.ok();
      warn!(error=?e, "failed to create game, rolling back bucket creation");
      Err(e)?
    }
  }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn update_game(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref queue): State<Queue>,
  State(ref bucket): State<Bucket>, Extension(game): Extension<game::Model>,
  Extension(trace): Extension<RequestId>, Extension(token): Extension<Token>,
  Json(model): Json<game::Model>,
) -> Result<impl IntoResponse, ResponseError> {
  super::ensure_game_sync_writable(&db.conn, &game).await?;
  let txn = db.conn.begin().await?;
  let model = game::update(
    &txn,
    game::Model {
      id: game.id,
      bucket: game.bucket.clone(),
      sync_key: game.sync_key.clone(),
      sync_token: game.sync_token.clone(),
      traffic: game.traffic.clone(),
      lifecycle: game.lifecycle.clone(),
      node_selector: game.node_selector.clone(),
      introduction_id: game.introduction_id,
      ..model
    },
  )
  .await?;
  cache.at("game").del(game.id).await?;
  let game_bucket = super::get_game_bucket_mut(bucket, &model).await?;
  game_bucket
    .set_config(serde_json::to_value(&model)?)
    .await?;
  game_bucket
    .commit(
      ":construction: update game config",
      &token.account,
      format!("{}@private.ret.sh.cn", token.account),
    )
    .await?;
  txn.commit().await?;
  if game.frozen != model.frozen {
    info!(
      "user {} the game",
      if model.frozen { "freeze" } else { "unfreeze" },
    );
    let payload = EventContainer {
      game_id: game.id,
      event: Event::Game(GameEvent {
        event_type: if model.frozen {
          GameEventType::Freeze
        } else {
          GameEventType::Unfreeze
        },
        operator: user::Model {
          id: token.id,
          account: token.account.clone(),
          nickname: token.nickname.clone(),
          ..Default::default()
        },
        message: format!(
          "{} the game",
          if model.frozen { "Freeze" } else { "Unfreeze" }
        ),
      }),
    };
    queue
      .publish(
        "event",
        payload,
        &trace.header_value().to_str().unwrap_or("UNKNOWN"),
      )
      .await
      .ok();
  }
  info!("updated game");
  Ok(Json(model))
}

#[derive(Deserialize)]
pub(super) struct DeleteGameQuery {
  pub force: Option<bool>,
}

pub(super) async fn delete_game(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Query(query): Query<DeleteGameQuery>,
) -> Result<impl IntoResponse, ResponseError> {
  let challenges = challenge_db::count(&db.conn, Some(game.id), Some(game.host_type), true).await?;
  if challenges > 0 && !query.force.unwrap_or(false) {
    return Err(ResponseError::PreconditionFailed(
      "game has existing challenges, can not be deleted safely".to_owned(),
    ));
  }
  cache.at("game").del(game.id).await?;
  invalidate_game_doc_cache(cache, game.id).await?;
  game::delete(&db.conn, game.id).await?;
  let delete_result = bucket.delete(&game.bucket.clone().unwrap()).await;
  if !query.force.unwrap_or(false) {
    delete_result?;
  }
  info!("deleted game");
  Ok(())
}

pub(super) async fn redirect_game_intro_to_readme() -> impl IntoResponse {
  (StatusCode::PERMANENT_REDIRECT, [(LOCATION, "doc/readme")])
}

pub(super) async fn update_game_intro_compat(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Extension(token): Extension<Token>,
  Json(payload): Json<Value>,
) -> Result<impl IntoResponse, ResponseError> {
  super::ensure_game_sync_writable(&db.conn, &game).await?;
  let content = extract_legacy_intro_content(payload)?;
  Ok(Json(
    persist_game_doc(cache, bucket, &game, &token, GameDocKind::Readme, &content).await?,
  ))
}

pub(super) async fn get_game_doc(
  State(ref cache): State<Cache>, State(ref bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Path((_, doc)): Path<(String, GameDocKind)>,
  headers: HeaderMap,
) -> Result<impl IntoResponse, ResponseError> {
  let locale = GameDocLocale::from_headers(&headers);
  let cache_key = game_doc_cache_key(game.id, doc, locale);
  let doc_cache = cache.at("game-doc");

  if let Some(content) = doc_cache.get::<String>(&cache_key).await? {
    return Ok(Json(content));
  }

  let game_bucket = bucket
    .at(
      game
        .bucket
        .clone()
        .ok_or(ResponseError::PreconditionFailed(
          "game bucket not found".to_owned(),
        ))?,
    )
    .await?;
  let content = game_bucket
    .read_document(doc.as_bucket_document())
    .await?
    .unwrap_or_else(|| doc.default_value(locale).to_owned());

  doc_cache
    .set_ex(&cache_key, &content, GAME_DOC_CACHE_TTL)
    .await?;

  Ok(Json(content))
}

pub(super) async fn update_game_doc(
  State(ref db): State<Database>, State(ref cache): State<Cache>, State(ref bucket): State<Bucket>,
  Extension(game): Extension<game::Model>, Extension(token): Extension<Token>,
  Path((_, doc)): Path<(String, GameDocKind)>, Json(content): Json<String>,
) -> Result<impl IntoResponse, ResponseError> {
  super::ensure_game_sync_writable(&db.conn, &game).await?;
  Ok(Json(
    persist_game_doc(cache, bucket, &game, &token, doc, &content).await?,
  ))
}

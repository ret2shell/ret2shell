use chrono::{
  DateTime, Utc,
  serde::{ts_seconds, ts_seconds_option},
};
use num_derive::{FromPrimitive, ToPrimitive};
use sea_orm::{ActiveValue, FromJsonQueryResult, IntoActiveModel, QueryOrder, entity::prelude::*};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(
  Clone,
  Debug,
  Default,
  PartialEq,
  Eq,
  Serialize_repr,
  Deserialize_repr,
  EnumIter,
  DeriveActiveEnum,
  FromPrimitive,
  ToPrimitive,
)]
#[repr(i32)]
#[sea_orm(rs_type = "i32", db_type = "Integer")]
pub enum SyncJobKind {
  #[default]
  Publish = 0,
  Import  = 1,
}

#[derive(
  Clone,
  Debug,
  Default,
  PartialEq,
  Eq,
  Serialize_repr,
  Deserialize_repr,
  EnumIter,
  DeriveActiveEnum,
  FromPrimitive,
  ToPrimitive,
)]
#[repr(i32)]
#[sea_orm(rs_type = "i32", db_type = "Integer")]
pub enum SyncJobMode {
  #[default]
  Registry = 0,
  Direct   = 1,
}

#[derive(
  Clone,
  Debug,
  Default,
  PartialEq,
  Eq,
  Serialize_repr,
  Deserialize_repr,
  EnumIter,
  DeriveActiveEnum,
  FromPrimitive,
  ToPrimitive,
)]
#[repr(i32)]
#[sea_orm(rs_type = "i32", db_type = "Integer")]
pub enum SyncJobStatus {
  #[default]
  Pending   = 0,
  Running   = 1,
  Paused    = 2,
  Failed    = 3,
  Completed = 4,
  Cancelled = 5,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, FromJsonQueryResult)]
pub struct JsonObject(pub Value);

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "game_sync_job")]
pub struct Model {
  #[sea_orm(primary_key)]
  pub id: i64,
  pub kind: SyncJobKind,
  pub mode: SyncJobMode,
  pub status: SyncJobStatus,
  pub stage: String,
  pub game_id: Option<i64>,
  pub game_key: Option<String>,
  pub release_id: Option<String>,
  pub registry_source_id: Option<i64>,
  pub upstream_instance_id: Option<String>,
  pub upstream_base_url: Option<String>,
  #[sea_orm(column_type = "JsonBinary")]
  pub request_body: JsonObject,
  #[sea_orm(column_type = "JsonBinary")]
  pub checkpoint: JsonObject,
  pub error_message: Option<String>,
  pub created_by: i64,
  #[serde(with = "ts_seconds")]
  pub created_at: DateTime<Utc>,
  #[serde(with = "ts_seconds")]
  pub updated_at: DateTime<Utc>,
  #[serde(with = "ts_seconds_option", default = "Option::default")]
  pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
  #[sea_orm(
    belongs_to = "super::game::Entity",
    from = "Column::GameId",
    to = "super::game::Column::Id",
    on_update = "Cascade",
    on_delete = "SetNull"
  )]
  Game,
  #[sea_orm(
    belongs_to = "super::game_registry_source::Entity",
    from = "Column::RegistrySourceId",
    to = "super::game_registry_source::Column::Id",
    on_update = "Cascade",
    on_delete = "SetNull"
  )]
  RegistrySource,
  #[sea_orm(
    belongs_to = "super::user::Entity",
    from = "Column::CreatedBy",
    to = "super::user::Column::Id",
    on_update = "Cascade",
    on_delete = "Restrict"
  )]
  Creator,
}

impl Related<super::game::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::Game.def()
  }
}

impl Related<super::game_registry_source::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::RegistrySource.def()
  }
}

impl Related<super::user::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::Creator.def()
  }
}

impl ActiveModelBehavior for ActiveModel {}

pub async fn get<C>(db: &C, id: i64) -> Result<Option<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find_by_id(id).one(db).await
}

pub async fn get_list<C>(db: &C) -> Result<Vec<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find()
    .order_by_desc(Column::CreatedAt)
    .order_by_desc(Column::Id)
    .all(db)
    .await
}

pub async fn create<C>(db: &C, job: Model) -> Result<Model, DbErr>
where
  C: ConnectionTrait, {
  let job = ActiveModel {
    id: ActiveValue::NotSet,
    ..job.into_active_model().reset_all()
  };
  job.insert(db).await
}

pub async fn update<C>(db: &C, job: Model) -> Result<Model, DbErr>
where
  C: ConnectionTrait, {
  let job = ActiveModel {
    id: ActiveValue::Unchanged(job.id),
    updated_at: ActiveValue::Set(Utc::now()),
    ..job.into_active_model().reset_all()
  };
  job.update(db).await
}

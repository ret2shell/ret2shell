use chrono::{
  DateTime, Utc,
  serde::{ts_seconds, ts_seconds_option},
};
use num_derive::{FromPrimitive, ToPrimitive};
use sea_orm::{ActiveValue, IntoActiveModel, entity::prelude::*};
use serde::{Deserialize, Serialize};
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
pub enum RemoteGameState {
  #[default]
  MirrorLocked = 0,
  Detached     = 1,
}

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "game_remote_sync")]
pub struct Model {
  #[sea_orm(primary_key, auto_increment = false)]
  pub game_id: i64,
  pub state: RemoteGameState,
  pub current_release_id: String,
  pub snapshot_commit: String,
  pub manifest_sha256: String,
  #[sea_orm(column_type = "Text")]
  pub manifest_body: String,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  pub selected_upstream_instance_id: String,
  pub selected_upstream_base_url: String,
  #[serde(with = "ts_seconds")]
  pub last_synced_at: DateTime<Utc>,
  #[serde(with = "ts_seconds_option", default = "Option::default")]
  pub detached_at: Option<DateTime<Utc>>,
  pub detached_by: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
  #[sea_orm(
    belongs_to = "super::game::Entity",
    from = "Column::GameId",
    to = "super::game::Column::Id",
    on_update = "Cascade",
    on_delete = "Cascade"
  )]
  Game,
  #[sea_orm(
    belongs_to = "super::user::Entity",
    from = "Column::DetachedBy",
    to = "super::user::Column::Id",
    on_update = "Cascade",
    on_delete = "SetNull"
  )]
  DetachedByUser,
}

impl Related<super::game::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::Game.def()
  }
}

impl Related<super::user::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::DetachedByUser.def()
  }
}

impl ActiveModelBehavior for ActiveModel {}

pub async fn get<C>(db: &C, game_id: i64) -> Result<Option<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find_by_id(game_id).one(db).await
}

pub async fn create<C>(db: &C, remote_sync: Model) -> Result<Model, DbErr>
where
  C: ConnectionTrait, {
  let remote_sync = ActiveModel {
    game_id: ActiveValue::Set(remote_sync.game_id),
    ..remote_sync.into_active_model().reset_all()
  };
  remote_sync.insert(db).await
}

pub async fn update<C>(db: &C, remote_sync: Model) -> Result<Model, DbErr>
where
  C: ConnectionTrait, {
  let remote_sync = ActiveModel {
    game_id: ActiveValue::Unchanged(remote_sync.game_id),
    ..remote_sync.into_active_model().reset_all()
  };
  remote_sync.update(db).await
}

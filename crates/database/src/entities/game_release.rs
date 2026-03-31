use chrono::{DateTime, Utc, serde::ts_seconds};
use num_derive::{FromPrimitive, ToPrimitive};
use sea_orm::{ActiveValue, IntoActiveModel, QueryOrder, entity::prelude::*};
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
pub enum OriginRole {
  #[default]
  FirstParty = 0,
  Mirror     = 1,
}

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "game_release")]
pub struct Model {
  #[sea_orm(primary_key)]
  pub id: i64,
  pub game_id: i64,
  pub game_key: String,
  pub release_id: String,
  pub snapshot_commit: String,
  pub manifest_sha256: String,
  #[sea_orm(column_type = "Text")]
  pub manifest_body: String,
  pub origin_role: OriginRole,
  pub first_party_instance_id: String,
  pub first_party_base_url: String,
  #[serde(with = "ts_seconds")]
  pub published_at: DateTime<Utc>,
  #[serde(with = "ts_seconds")]
  pub created_at: DateTime<Utc>,
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
}

impl Related<super::game::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::Game.def()
  }
}

impl ActiveModelBehavior for ActiveModel {}

pub async fn get<C>(db: &C, id: i64) -> Result<Option<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find_by_id(id).one(db).await
}

pub async fn get_by_game_and_release<C>(
  db: &C, game_id: i64, release_id: &str,
) -> Result<Option<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find()
    .filter(Column::GameId.eq(game_id))
    .filter(Column::ReleaseId.eq(release_id))
    .one(db)
    .await
}

pub async fn create<C>(db: &C, release: Model) -> Result<Model, DbErr>
where
  C: ConnectionTrait, {
  let release = ActiveModel {
    id: ActiveValue::NotSet,
    ..release.into_active_model().reset_all()
  };
  release.insert(db).await
}

pub async fn update<C>(db: &C, release: Model) -> Result<Model, DbErr>
where
  C: ConnectionTrait, {
  let release = ActiveModel {
    id: ActiveValue::Unchanged(release.id),
    ..release.into_active_model().reset_all()
  };
  release.update(db).await
}

pub async fn get_list_by_game<C>(db: &C, game_id: i64) -> Result<Vec<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find()
    .filter(Column::GameId.eq(game_id))
    .order_by_desc(Column::PublishedAt)
    .order_by_desc(Column::Id)
    .all(db)
    .await
}

pub async fn get_list<C>(db: &C) -> Result<Vec<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find()
    .order_by_desc(Column::PublishedAt)
    .order_by_desc(Column::Id)
    .all(db)
    .await
}

pub async fn get_list_by_game_key<C>(db: &C, game_key: &str) -> Result<Vec<Model>, DbErr>
where
  C: ConnectionTrait, {
  Entity::find()
    .filter(Column::GameKey.eq(game_key))
    .order_by_desc(Column::PublishedAt)
    .order_by_desc(Column::Id)
    .all(db)
    .await
}

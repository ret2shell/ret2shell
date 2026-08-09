use chrono::{DateTime, Utc, serde::ts_seconds};
use sea_orm::{
  ActiveValue, Condition, FromQueryResult, IntoActiveModel, JoinType, Order, QueryOrder,
  QuerySelect, QueryTrait, entity::prelude::*,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize, Default)]
#[sea_orm(table_name = "chat")]
pub struct Model {
  #[sea_orm(primary_key)]
  pub id: i64,
  #[serde(with = "ts_seconds")]
  pub created_at: DateTime<Utc>,
  #[sea_orm(column_type = "Text")]
  pub content: String,
  pub user_id: i64,
  pub team_id: i64,
  pub game_id: i64,
  pub challenge_id: i64,
  pub checked: bool,
  pub is_admin: bool,
}

#[derive(Clone, Serialize, Deserialize, FromQueryResult)]
pub struct ExModel {
  pub id: i64,
  #[serde(with = "ts_seconds")]
  pub created_at: DateTime<Utc>,
  pub content: String,
  pub user_id: i64,
  pub user_name: String,
  pub avatar: Option<String>,
  pub team_id: i64,
  pub team_name: String,
  pub game_id: i64,
  pub challenge_id: i64,
  pub challenge_name: String,
  pub checked: bool,
  pub is_admin: bool,
}

#[derive(Clone, Serialize, Deserialize, FromQueryResult)]
pub struct SessionModel {
  pub challenge_id: i64,
  pub challenge_name: String,
  pub team_id: i64,
  pub team_name: String,
  pub game_id: i64,
  pub game_name: String,
  pub checked: bool,
  #[serde(with = "ts_seconds")]
  pub last_active_at: DateTime<Utc>,
  pub last_message: Option<String>,
  pub last_user_id: Option<i64>,
  pub is_admin: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
  #[sea_orm(
    belongs_to = "super::user::Entity",
    from = "Column::UserId",
    to = "super::user::Column::Id",
    on_update = "Cascade",
    on_delete = "Cascade"
  )]
  User,
  #[sea_orm(
    belongs_to = "super::team::Entity",
    from = "Column::TeamId",
    to = "super::team::Column::Id",
    on_update = "Cascade",
    on_delete = "Cascade"
  )]
  Team,
  #[sea_orm(
    belongs_to = "super::game::Entity",
    from = "Column::GameId",
    to = "super::game::Column::Id",
    on_update = "Cascade",
    on_delete = "Cascade"
  )]
  Game,
  #[sea_orm(
    belongs_to = "super::challenge::Entity",
    from = "Column::ChallengeId",
    to = "super::challenge::Column::Id",
    on_update = "Cascade",
    on_delete = "Cascade"
  )]
  Challenge,
}

impl Related<super::user::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::User.def()
  }
}

impl Related<super::team::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::Team.def()
  }
}

impl Related<super::game::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::Game.def()
  }
}

impl Related<super::challenge::Entity> for Entity {
  fn to() -> RelationDef {
    Relation::Challenge.def()
  }
}

impl ActiveModelBehavior for ActiveModel {}

pub async fn get_sessions<C>(
  conn: &C, game_id: i64, challenge_id: Option<i64>, page: u64, page_size: u64,
) -> Result<(Vec<SessionModel>, u64), DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let page_size = page_size.max(1);
  let page = page.max(1);
  let mut sql = Entity::find().filter(Column::GameId.eq(game_id));
  if let Some(challenge_id) = challenge_id {
    sql = sql.filter(Column::ChallengeId.eq(challenge_id));
  }
  sql = sql.select_only().columns([
    Column::ChallengeId,
    Column::TeamId,
    Column::GameId,
    Column::Checked,
    Column::IsAdmin,
  ]);
  sql = sql
    .join(JoinType::InnerJoin, Relation::Challenge.def())
    .join(JoinType::InnerJoin, Relation::Team.def())
    .join(JoinType::InnerJoin, Relation::Game.def())
    // .order_by(Column::Checked, Order::Desc)
    // .order_by(Column::IsAdmin, Order::Asc)
    // .order_by(Column::CreatedAt, Order::Desc)
    .column_as(super::challenge::Column::Name, "challenge_name")
    .column_as(super::team::Column::Name, "team_name")
    .column_as(super::game::Column::Name, "game_name")
    .column_as(Column::UserId, "last_user_id")
    .column_as(Column::Content, "last_message")
    .column_as(Column::CreatedAt, "last_active_at");
  let sub_query = Entity::find()
    .select_only()
    .columns([Column::Id])
    .distinct_on([(Entity, Column::TeamId), (Entity, Column::ChallengeId)])
    .order_by_desc(Column::TeamId)
    .order_by_desc(Column::ChallengeId)
    .order_by_desc(Column::CreatedAt)
    .into_query();
  sql = sql
    .filter(Condition::any().add(Column::Id.in_subquery(sub_query)))
    .order_by_desc(Column::CreatedAt);

  let paginator = sql.into_model().paginate(conn, page_size);
  let total = paginator.num_items().await?;
  let result = paginator.fetch_page(page - 1).await?;

  Ok((result, total))
}

pub async fn get_list<C>(conn: &C, team_id: i64, challenge_id: i64) -> Result<Vec<ExModel>, DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let sql = Entity::find()
    .join(JoinType::InnerJoin, Relation::Challenge.def())
    .join(JoinType::InnerJoin, Relation::Team.def())
    .join(JoinType::InnerJoin, Relation::User.def())
    .column_as(super::challenge::Column::Name, "challenge_name")
    .column_as(super::team::Column::Name, "team_name")
    .column_as(super::user::Column::Nickname, "user_name")
    .column_as(super::user::Column::Avatar, "avatar")
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::ChallengeId.eq(challenge_id))
    .order_by(Column::CreatedAt, Order::Desc);
  let chats = sql.into_model().all(conn).await?;
  Ok(chats)
}

pub async fn get_last<C>(
  conn: &C, team_id: i64, challenge_id: i64,
) -> Result<Option<ExModel>, DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let sql = Entity::find()
    .join(JoinType::InnerJoin, Relation::Challenge.def())
    .join(JoinType::InnerJoin, Relation::Team.def())
    .join(JoinType::InnerJoin, Relation::User.def())
    .order_by(Column::CreatedAt, Order::Desc)
    .column_as(super::challenge::Column::Name, "challenge_name")
    .column_as(super::team::Column::Name, "team_name")
    .column_as(super::user::Column::Nickname, "user_name")
    .column_as(super::user::Column::Avatar, "avatar")
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::ChallengeId.eq(challenge_id));
  let chat = sql.into_model().one(conn).await?;
  Ok(chat)
}

pub async fn get_unchecked<C>(conn: &C, team_id: i64, is_admin: bool) -> Result<Vec<Model>, DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let chats = Entity::find()
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::Checked.eq(false))
    .filter(Column::IsAdmin.eq(is_admin))
    .distinct_on([(Entity, Column::TeamId), (Entity, Column::ChallengeId)])
    .all(conn)
    .await?;
  Ok(chats)
}

pub async fn create<C>(conn: &C, chat: Model) -> Result<Model, DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let chat = ActiveModel {
    id: ActiveValue::NotSet,
    created_at: ActiveValue::Set(Utc::now()),
    ..chat.into_active_model().reset_all()
  };
  chat.insert(conn).await
}

pub async fn mark_checked<C>(conn: &C, team_id: i64, challenge_id: i64) -> Result<(), DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let mut active_model = ActiveModel::new();
  active_model.checked = ActiveValue::Set(true);

  Entity::update_many()
    .set(active_model)
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::ChallengeId.eq(challenge_id))
    .filter(Column::Checked.eq(false))
    .exec(conn)
    .await?;
  Ok(())
}

pub async fn delete<C>(conn: &C, id: i64) -> Result<(), DbErr>
where
  C: sea_orm::ConnectionTrait, {
  Entity::delete_by_id(id).exec(conn).await?;
  Ok(())
}

pub async fn delete_session<C>(conn: &C, team_id: i64, challenge_id: i64) -> Result<(), DbErr>
where
  C: sea_orm::ConnectionTrait, {
  Entity::delete_many()
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::ChallengeId.eq(challenge_id))
    .exec(conn)
    .await?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use sea_orm::{QueryTrait, sea_query::PostgresQueryBuilder};

  use super::*;

  #[test]
  fn test_session_sql() {
    let mut sql = Entity::find()
      .filter(Column::GameId.eq(1))
      .select_only()
      .columns([
        Column::ChallengeId,
        Column::TeamId,
        Column::GameId,
        Column::Checked,
      ]);
    sql = sql
      .join(JoinType::InnerJoin, Relation::Challenge.def())
      .join(JoinType::InnerJoin, Relation::Team.def())
      .join(JoinType::InnerJoin, Relation::Game.def())
      .column_as(super::super::challenge::Column::Name, "challenge_name")
      .column_as(super::super::team::Column::Name, "team_name")
      .column_as(super::super::game::Column::Name, "game_name")
      .column_as(Column::UserId, "last_user_id")
      .column_as(Column::Content, "last_message")
      .column_as(Column::CreatedAt, "last_active_at");
    sql = sql.distinct_on([(Entity, Column::TeamId), (Entity, Column::ChallengeId)]);
    let query = sql.into_query();
    let (sql_str, _) = query.build(PostgresQueryBuilder);
    println!("{sql_str}");
  }
}

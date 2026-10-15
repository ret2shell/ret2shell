use chrono::{DateTime, Utc, serde::ts_seconds};
use sea_orm::{
  ActiveValue, FromQueryResult, IntoActiveModel, JoinType, Order, QueryOrder, QuerySelect,
  QueryTrait, entity::prelude::*, sea_query::ExprTrait,
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
  pub last_message_id: i64,
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

/// Cursor-paginated session list: one row per (team, challenge) with its newest
/// message.
///
/// `cursor` is the `last_message_id` of the previous page (keyset on
/// `max(chat.id)`). Returns `(items, has_more)` ordered by `last_message_id`
/// DESC.
pub async fn get_sessions_page<C>(
  conn: &C, game_id: i64, challenge_id: Option<i64>, cursor: Option<i64>, limit: u64,
) -> Result<(Vec<SessionModel>, bool), DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let limit = Ord::max(limit, 1);

  let mut sub = Entity::find()
    .select_only()
    .column_as(Column::Id.max(), "max_id")
    .filter(Column::GameId.eq(game_id))
    .group_by(Column::TeamId)
    .group_by(Column::ChallengeId);
  if let Some(challenge_id) = challenge_id {
    sub = sub.filter(Column::ChallengeId.eq(challenge_id));
  }
  if let Some(cursor) = cursor {
    // HAVING max(id) < cursor keeps the keyset semantics correct even when
    // different sessions interleave in id space.
    sub = sub.having(Column::Id.max().lt(cursor));
  }
  let sub_query = sub.into_query();

  let query = Entity::find()
    .filter(Column::GameId.eq(game_id))
    .select_only()
    .columns([
      Column::ChallengeId,
      Column::TeamId,
      Column::GameId,
      Column::Checked,
      Column::IsAdmin,
    ])
    .join(JoinType::InnerJoin, Relation::Challenge.def())
    .join(JoinType::InnerJoin, Relation::Team.def())
    .join(JoinType::InnerJoin, Relation::Game.def())
    .column_as(super::challenge::Column::Name, "challenge_name")
    .column_as(super::team::Column::Name, "team_name")
    .column_as(super::game::Column::Name, "game_name")
    .column_as(Column::Id, "last_message_id")
    .column_as(Column::UserId, "last_user_id")
    .column_as(Column::Content, "last_message")
    .column_as(Column::CreatedAt, "last_active_at")
    .filter(Column::Id.in_subquery(sub_query))
    .order_by_desc(Column::Id)
    .limit(limit + 1);

  let mut sessions = query.into_model().all(conn).await?;
  let has_more = sessions.len() as u64 > limit;
  sessions.truncate(limit as usize);
  Ok((sessions, has_more))
}

/// Keyset-paginated message history for a single (team, challenge) session.
///
/// * `after_id`  -> messages newer than the cursor, ascending (incremental
///   polling).
/// * `before_id` -> messages older than the cursor, ascending (load older
///   history).
/// * neither     -> the newest page, ascending.
///
/// Returns `(items, has_more)`. `items` is always ascending by id.
pub async fn get_list_page<C>(
  conn: &C, team_id: i64, challenge_id: i64, after_id: Option<i64>, before_id: Option<i64>,
  limit: u64,
) -> Result<(Vec<ExModel>, bool), DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let limit = Ord::max(limit, 1);
  let mut query = Entity::find()
    .join(JoinType::InnerJoin, Relation::Challenge.def())
    .join(JoinType::InnerJoin, Relation::Team.def())
    .join(JoinType::InnerJoin, Relation::User.def())
    .column_as(super::challenge::Column::Name, "challenge_name")
    .column_as(super::team::Column::Name, "team_name")
    .column_as(super::user::Column::Nickname, "user_name")
    .column_as(super::user::Column::Avatar, "avatar")
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::ChallengeId.eq(challenge_id));

  let ascending = if let Some(after_id) = after_id {
    query = query
      .filter(Column::Id.gt(after_id))
      .order_by_asc(Column::Id);
    true
  } else if let Some(before_id) = before_id {
    query = query
      .filter(Column::Id.lt(before_id))
      .order_by_desc(Column::Id);
    false
  } else {
    query = query.order_by_desc(Column::Id);
    false
  };

  let mut rows = query.limit(limit + 1).into_model().all(conn).await?;
  let has_more = rows.len() as u64 > limit;
  rows.truncate(limit as usize);
  if !ascending {
    rows.reverse();
  }
  Ok((rows, has_more))
}

/// How many messages `user_id` has sent in the session since the newest admin
/// reply. Used to enforce the per-user "3 messages before a reply" limit.
///
/// This only reads the rows needed for the quota; every message in the session
/// (including teammates' messages) is still listed by `get_list_page`. The scan
/// stays small because each user can send at most three messages after the
/// newest admin reply.
pub async fn count_pending_messages<C>(
  conn: &C, team_id: i64, challenge_id: i64, user_id: i64,
) -> Result<u64, DbErr>
where
  C: sea_orm::ConnectionTrait, {
  let last_admin_id = Entity::find()
    .select_only()
    .column(Column::Id)
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::ChallengeId.eq(challenge_id))
    .filter(Column::IsAdmin.eq(true))
    .order_by_desc(Column::Id)
    .limit(1)
    .into_tuple::<i64>()
    .one(conn)
    .await?
    .unwrap_or(0);

  Entity::find()
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::ChallengeId.eq(challenge_id))
    .filter(Column::UserId.eq(user_id))
    .filter(Column::Id.gt(last_admin_id))
    .count(conn)
    .await
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
  Entity::find()
    .filter(Column::TeamId.eq(team_id))
    .filter(Column::Checked.eq(false))
    .filter(Column::IsAdmin.eq(is_admin))
    .distinct_on([Column::TeamId, Column::ChallengeId])
    .order_by_asc(Column::TeamId)
    .order_by_asc(Column::ChallengeId)
    .order_by_desc(Column::Id)
    .all(conn)
    .await
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

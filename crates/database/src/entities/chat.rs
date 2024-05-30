use chrono::{serde::ts_seconds, DateTime, Utc};
use sea_orm::{
    entity::prelude::*, ActiveValue, FromQueryResult, IntoActiveModel, JoinType, Order, QueryOrder,
    QuerySelect,
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
}

#[derive(Clone, Serialize, Deserialize, FromQueryResult)]
pub struct ExModel {
    pub id: i64,
    #[serde(with = "ts_seconds")]
    pub created_at: DateTime<Utc>,
    pub content: String,
    pub user_id: i64,
    pub user_name: String,
    pub avatar: String,
    pub team_id: i64,
    pub team_name: String,
    pub game_id: i64,
    pub challenge_id: i64,
    pub challenge_name: String,
    pub checked: bool,
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

pub async fn get_sessions<C>(conn: &C, game_id: i64) -> Result<Vec<SessionModel>, DbErr>
where
    C: sea_orm::ConnectionTrait, {
    let mut sql = Entity::find()
        .filter(Column::GameId.eq(game_id))
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
        .order_by(Column::Checked, Order::Desc)
        .order_by(Column::CreatedAt, Order::Desc)
        .column_as(super::challenge::Column::Name, "challenge_name")
        .column_as(super::team::Column::Name, "team_name")
        .column_as(super::game::Column::Name, "game_name")
        .column_as(Column::UserId, "last_user_id")
        .column_as(Column::Content, "last_message")
        .column_as(Column::CreatedAt, "last_active_at");
    sql = sql.distinct_on([(Entity, Column::TeamId), (Entity, Column::ChallengeId)]);

    let result = sql.into_model().all(conn).await?;
    Ok(result)
}

pub async fn get_list<C>(conn: &C, team_id: i64, challenge_id: i64) -> Result<Vec<ExModel>, DbErr>
where
    C: sea_orm::ConnectionTrait, {
    let sql = Entity::find()
        .join(JoinType::InnerJoin, Relation::Challenge.def())
        .join(JoinType::InnerJoin, Relation::Team.def())
        .join(JoinType::InnerJoin, Relation::User.def())
        .order_by(Column::Checked, Order::Desc)
        .order_by(Column::CreatedAt, Order::Desc)
        .column_as(super::challenge::Column::Name, "challenge_name")
        .column_as(super::team::Column::Name, "team_name")
        .column_as(super::user::Column::Account, "user_name")
        .column_as(super::user::Column::Avatar, "avatar")
        .filter(Column::TeamId.eq(team_id))
        .filter(Column::ChallengeId.eq(challenge_id))
        .order_by(Column::CreatedAt, Order::Asc);
    let chats = sql.into_model().all(conn).await?;
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

pub async fn mark_checked<C>(conn: &C, id: i64) -> Result<Model, DbErr>
where
    C: sea_orm::ConnectionTrait, {
    let model = ActiveModel {
        id: ActiveValue::Unchanged(id),
        checked: ActiveValue::Set(true),
        created_at: ActiveValue::NotSet,
        content: ActiveValue::NotSet,
        user_id: ActiveValue::NotSet,
        team_id: ActiveValue::NotSet,
        game_id: ActiveValue::NotSet,
        challenge_id: ActiveValue::NotSet,
    };
    model.update(conn).await
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
    use sea_orm::QueryTrait;
    use sea_query::PostgresQueryBuilder;

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
        println!("{}", sql_str);
    }
}

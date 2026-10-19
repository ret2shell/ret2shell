use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m_20261019_000001_extra_blood_state"
  }
}

#[derive(Iden)]
enum Extra {
  Table,
  BloodState,
  ChallengeId,
  TeamId,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(Extra::Table)
          .add_column_if_not_exists(ColumnDef::new(Extra::BloodState).integer())
          .to_owned(),
      )
      .await?;

    // Backfill the blood state from the legacy reward reason, whose format is
    // `No.{blood_state} solution for challenge {id}:{name}`.
    manager
      .get_connection()
      .execute_unprepared(
        r#"
        UPDATE "extra"
           SET "blood_state" = substring(
                 "reason" from '^No\.([1-3]) solution for challenge '
               )::integer
         WHERE "blood_state" IS NULL
           AND "reason" ~ '^No\.[1-3] solution for challenge '
        "#,
      )
      .await?;

    manager
      .create_index(
        Index::create()
          .name("idx_extra_challenge_id")
          .table(Extra::Table)
          .col(Extra::ChallengeId)
          .if_not_exists()
          .to_owned(),
      )
      .await?;
    manager
      .create_index(
        Index::create()
          .name("idx_extra_team_id")
          .table(Extra::Table)
          .col(Extra::TeamId)
          .if_not_exists()
          .to_owned(),
      )
      .await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .drop_index(Index::drop().name("idx_extra_challenge_id").to_owned())
      .await?;
    manager
      .drop_index(Index::drop().name("idx_extra_team_id").to_owned())
      .await?;
    manager
      .alter_table(
        Table::alter()
          .table(Extra::Table)
          .drop_column(Extra::BloodState)
          .to_owned(),
      )
      .await?;
    Ok(())
  }
}

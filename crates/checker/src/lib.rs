use std::collections::HashMap;

use r2s_bucket::challenge::ChallengeBucket;
use r2s_database::{challenge, submission, team, user};
use r2s_engine::{DiagnosticMarker, Engine, EngineError, parse_value, script_error_from_value};
use rune::{Any, ContextError, Module, Value, runtime::Object};
use serde::{Deserialize, Serialize};
use tracing::debug;

#[derive(Clone, Debug, Default)]
pub struct Checker;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AuditMessage {
  pub peer_team: i64,
  pub reason: String,
}

#[derive(Clone, Debug, Any)]
#[rune(item = ::ret2shell::checker)]
pub struct RuneUser {
  #[rune(get)]
  pub id: i64,
  #[rune(get)]
  pub account: String,
  #[rune(get)]
  pub institute_id: Option<i64>,
}

impl From<&user::Model> for RuneUser {
  fn from(user: &user::Model) -> Self {
    Self {
      id: user.id,
      account: user.account.clone(),
      institute_id: user.institute_id,
    }
  }
}

#[derive(Clone, Debug, Any, Default)]
#[rune(item = ::ret2shell::checker)]
pub struct RuneTeam {
  #[rune(get)]
  pub id: Option<i64>,
  #[rune(get)]
  pub name: Option<String>,
  #[rune(get)]
  pub institute_id: Option<i64>,
  #[rune(get)]
  pub token: Option<String>,
}

impl From<&team::Model> for RuneTeam {
  fn from(team: &team::Model) -> Self {
    Self {
      id: Some(team.id),
      name: Some(team.name.clone()),
      institute_id: team.institute_id,
      token: team.token.clone(),
    }
  }
}

#[derive(Clone, Debug, Any)]
#[rune(item = ::ret2shell::checker)]
pub struct RuneSubmission {
  #[rune(get)]
  pub id: i64,
  #[rune(get)]
  pub user_id: i64,
  #[rune(get)]
  pub team_id: Option<i64>,
  #[rune(get)]
  pub challenge_id: i64,
  #[rune(get)]
  pub content: String,
}

impl From<&submission::Model> for RuneSubmission {
  fn from(submission: &submission::Model) -> Self {
    Self {
      id: submission.id,
      user_id: submission.user_id,
      team_id: submission.team_id,
      challenge_id: submission.challenge_id,
      content: submission.content.clone().unwrap_or_default(),
    }
  }
}

#[rune::module(::ret2shell::checker)]
fn module(_stdio: bool) -> Result<Module, ContextError> {
  let mut module = Module::from_meta(self::module_meta)?;
  module.ty::<RuneUser>()?;
  module.ty::<RuneTeam>()?;
  module.ty::<RuneSubmission>()?;
  Ok(module)
}

impl Checker {
  fn default_modules() -> Vec<fn(bool) -> Result<rune::Module, rune::ContextError>> {
    vec![
      rune_modules::http::module,
      rune_modules::json::module,
      rune_modules::toml::module,
      rune_modules::process::module,
      ret2script::modules::crypto::module,
      ret2script::modules::bucket::module,
      ret2script::modules::audit::module,
      ret2script::modules::utils::module,
      ret2script::modules::regex::module,
      module,
    ]
  }

  /// linter for rune scripts
  /// Originally from https://github.com/ElaBosak233/cdsctf/blob/main/crates/checker/src/traits.rs
  pub async fn lint(&self, bucket: &ChallengeBucket) -> Result<Vec<DiagnosticMarker>, EngineError> {
    let script = bucket
      .checker()
      .await
      .map_err(|_err| EngineError::MissingCheckerScript(bucket.name.clone()))?;
    Engine::lint(Self::default_modules(), script, &["check", "environ"]).await
  }

  pub async fn expire(&self, engine: &Engine, bucket: &ChallengeBucket) {
    engine.expire(format!("challenge-{}", bucket.hash())).await;
  }

  pub async fn preload(
    &self, engine: &Engine, challenge: &challenge::Model, bucket: &ChallengeBucket,
  ) -> Result<(), EngineError> {
    engine
      .preload(
        Self::default_modules(),
        format!("challenge-{}", bucket.hash()),
        bucket
          .checker()
          .await
          .map_err(|_| EngineError::MissingCheckerScript(bucket.name.clone()))?,
        Some(challenge.updated_at),
      )
      .await
  }

  /// Check the flag and return results and audit messages.
  ///
  /// ## Returns
  ///
  /// (correct: bool, msg: String, Option<(peer_team: Option<i64>, reason:
  /// String)>)
  pub async fn check(
    &self, engine: &Engine, bucket: &ChallengeBucket, user: &user::Model,
    team: &Option<team::Model>, submission: &submission::Model,
  ) -> Result<(bool, String, Option<AuditMessage>), EngineError> {
    let key = format!("challenge-{}", bucket.hash());
    debug!(?user, "loading user");
    let user_object: RuneUser = user.into();
    debug!(?submission, "loading submission");
    let submission_object: RuneSubmission = submission.into();
    debug!(?team, "loading team");
    let team_object = match team {
      Some(team) => RuneTeam::from(team),
      None => RuneTeam::default(),
    };
    let bucket = ret2script::modules::bucket::Bucket::try_new(bucket.path())?;
    let output: Result<Value, Value> = engine
      .execute_as(
        key,
        "check",
        (bucket, user_object, team_object, submission_object),
        "`Result`",
      )
      .await?;
    debug!(?output, function = "check", "checker finished");
    let value = match output {
      Ok(value) => value,
      Err(error) => return Err(script_error_from_value(error)),
    };
    let (result, message, audit): (bool, String, Option<Object>) = parse_value(
      value,
      "a `(bool, String, Option<Object>)` tuple inside `Ok`",
    )?;
    let audit = if let Some(audit) = audit {
      Some(AuditMessage {
        peer_team: parse_value(
          audit
            .get("peer_team")
            .ok_or(EngineError::MissingResultField(
              "audit::peer_team".to_owned(),
            ))?
            .to_owned(),
          "an `i64` field `audit.peer_team`",
        )?,
        reason: parse_value(
          audit
            .get("reason")
            .ok_or(EngineError::MissingResultField("audit::reason".to_owned()))?
            .to_owned(),
          "a `String` field `audit.reason`",
        )?,
      })
    } else {
      None
    };
    Ok((result, message, audit))
  }

  pub async fn environ(
    &self, engine: &Engine, bucket: &ChallengeBucket, user: &user::Model,
    team: &Option<team::Model>,
  ) -> Result<HashMap<String, String>, EngineError> {
    let key = format!("challenge-{}", bucket.hash());
    let user_object = RuneUser::from(user);
    let team_object = match team {
      Some(team) => RuneTeam::from(team),
      None => RuneTeam::default(),
    };
    let bucket = ret2script::modules::bucket::Bucket::try_new(bucket.path())?;
    debug!("calling environ");
    let output: Result<Value, Value> = engine
      .execute_as(
        key,
        "environ",
        (bucket, user_object, team_object),
        "`Result`",
      )
      .await?;
    debug!(?output, function = "environ", "checker finished");
    let value = match output {
      Ok(value) => value,
      Err(error) => return Err(script_error_from_value(error)),
    };
    let object: Object = parse_value(value, "`Object` inside `Ok`")?;
    let mut environ = HashMap::new();
    for (key, value) in object.iter() {
      environ.insert(
        key.to_string(),
        parse_value(
          value.clone(),
          format!("a `String` environment variable `{key}`"),
        )?,
      );
    }
    Ok(environ)
  }
}

pub async fn initialize() -> Checker {
  Checker
}

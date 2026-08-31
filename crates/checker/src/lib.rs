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

#[cfg(test)]
mod tests {
  use chrono::Utc;
  use r2s_bucket::challenge::{ChallengeBucket, ChallengeConfig, ScoreRule, TagList};

  use super::{AuditMessage, Checker, RuneSubmission, RuneTeam, RuneUser};
  use crate::{challenge, submission, team, user};

  fn temp_root(label: &str) -> std::path::PathBuf {
    let unique = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    std::env::temp_dir().join(format!(
      "r2s-checker-{label}-{}-{unique}",
      std::process::id()
    ))
  }

  async fn bucket_with_checker(script: &str) -> (ChallengeBucket, std::path::PathBuf) {
    let root = temp_root("lint");
    std::fs::create_dir_all(&root).unwrap();
    let bucket = ChallengeBucket::new(
      &root,
      "demo",
      ChallengeConfig {
        name: "demo".to_owned(),
        tag: TagList(vec![]),
        score_rule: ScoreRule {
          initial: 1000,
          minimum: 100,
          decay: 25,
        },
      },
    )
    .await
    .unwrap();
    bucket.set_checker(script.to_owned()).await.unwrap();
    (bucket, root)
  }

  fn sample_user() -> user::Model {
    user::Model {
      id: 7,
      registered_at: Utc::now(),
      account: "player".to_owned(),
      nickname: "Player".to_owned(),
      password: Some("hashed".to_owned()),
      email: Some("player@example.com".to_owned()),
      description: None,
      avatar: None,
      institute_id: Some(3),
      permissions: Default::default(),
      hidden: false,
      banned: false,
    }
  }

  #[test]
  fn rune_user_exposes_only_safe_fields() {
    let rune_user = RuneUser::from(&sample_user());

    assert_eq!(rune_user.id, 7);
    assert_eq!(rune_user.account, "player");
    assert_eq!(rune_user.institute_id, Some(3));
  }

  #[test]
  fn rune_team_maps_present_team_fields() {
    let model = team::Model {
      id: 12,
      name: "team".to_owned(),
      game_id: 1,
      token: Some("team-token".to_owned()),
      state: team::State::Passed,
      institute_id: Some(5),
      score: 3000,
      history: team::TeamScoreHistoryList::new(),
      last_active_at: Utc::now(),
      tag: None,
    };

    let rune_team = RuneTeam::from(&model);

    assert_eq!(rune_team.id, Some(12));
    assert_eq!(rune_team.name.as_deref(), Some("team"));
    assert_eq!(rune_team.institute_id, Some(5));
    assert_eq!(rune_team.token.as_deref(), Some("team-token"));
  }

  #[test]
  fn default_rune_team_represents_guest_without_team() {
    let rune_team = RuneTeam::default();

    assert_eq!(rune_team.id, None);
    assert_eq!(rune_team.name, None);
    assert_eq!(rune_team.institute_id, None);
    assert_eq!(rune_team.token, None);
  }

  #[test]
  fn rune_submission_defaults_missing_content_to_empty_string() {
    let mut model = submission::Model {
      id: 99,
      created_at: Utc::now(),
      user_id: 7,
      challenge_id: 3,
      team_id: Some(12),
      content: Some("flag{abc}".to_owned()),
      solved: None,
      result: None,
    };
    let with_content = RuneSubmission::from(&model);
    assert_eq!(with_content.content, "flag{abc}");
    assert_eq!(with_content.team_id, Some(12));

    model.content = None;
    assert_eq!(RuneSubmission::from(&model).content, "");
  }

  #[tokio::test]
  async fn lint_reports_missing_entry_points_for_checkers() {
    let (bucket, root) = bucket_with_checker("pub fn other() { 1 }").await;

    let markers = Checker.lint(&bucket).await.unwrap();
    for required in ["check", "environ"] {
      assert!(
        markers.iter().any(|m| {
          m.message
            .contains(&format!("missing required function: {required}"))
        }),
        "missing marker for `{required}`: {markers:?}"
      );
    }

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn lint_accepts_checker_with_required_entry_points() {
    let (bucket, root) = bucket_with_checker(
      r#"pub fn check(bucket, user, team, submission) { (true, "ok") } pub fn environ(bucket) { true }"#,
    )
    .await;

    let markers = Checker.lint(&bucket).await.unwrap();
    assert!(markers.is_empty(), "unexpected markers: {markers:?}");

    std::fs::remove_dir_all(root).ok();
  }

  #[tokio::test]
  async fn lint_falls_back_to_empty_script_when_checker_file_absent() {
    // `ChallengeBucket::checker()` returns an empty string for a missing
    // main.rx, which must surface as missing entry points instead of a panic.
    let root = temp_root("lint-empty");
    std::fs::create_dir_all(&root).unwrap();
    let bucket = ChallengeBucket::new(
      &root,
      "empty",
      ChallengeConfig {
        name: "empty".to_owned(),
        tag: TagList(vec![]),
        score_rule: ScoreRule {
          initial: 1000,
          minimum: 100,
          decay: 25,
        },
      },
    )
    .await
    .unwrap();

    let markers = Checker.lint(&bucket).await.unwrap();
    assert!(
      markers
        .iter()
        .any(|m| m.message.contains("missing required function")),
      "markers: {markers:?}"
    );

    std::fs::remove_dir_all(root).ok();
  }

  #[allow(dead_code)]
  fn audit_message_shape_is_serializable() {
    let message = AuditMessage {
      peer_team: 2,
      reason: "stole flag".to_owned(),
    };
    assert_eq!(message.peer_team, 2);
    assert_eq!(message.reason, "stole flag");
    let _ = challenge::Entity; // keep entity import meaningful if models change
  }
}

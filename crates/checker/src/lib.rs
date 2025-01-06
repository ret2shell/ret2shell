use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use r2s_bucket::challenge::ChallengeBucket;
use r2s_database::{challenge, submission, team, user};
use rune::{
  runtime::{Object, RuntimeContext},
  termcolor::Buffer,
  Any, Context, ContextError, Diagnostics, Module, Source, Sources, Unit, Value, Vm,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::debug;
use traits::CheckerError;

pub mod traits;

type CheckerContext = (Arc<Unit>, Arc<RuntimeContext>, DateTime<Utc>);

#[derive(Clone, Debug, Default)]
pub struct Checker {
  contexts: Arc<RwLock<HashMap<String, CheckerContext>>>,
}

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
}

impl From<&team::Model> for RuneTeam {
  fn from(team: &team::Model) -> Self {
    Self {
      id: Some(team.id),
      name: Some(team.name.clone()),
      institute_id: team.institute_id,
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
  async fn build_context() -> Result<Context, CheckerError> {
    let mut context = Context::with_default_modules()?;
    context.install(rune_modules::http::module(true)?)?;
    context.install(rune_modules::json::module(true)?)?;
    context.install(rune_modules::toml::module(true)?)?;
    context.install(rune_modules::process::module(true)?)?;
    context.install(ret2script::modules::crypto::module(true)?)?;
    context.install(ret2script::modules::bucket::module(true)?)?;
    context.install(ret2script::modules::audit::module(true)?)?;
    context.install(ret2script::modules::utils::module(true)?)?;
    context.install(ret2script::modules::regex::module(true)?)?;
    context.install(module(true)?)?;
    Ok(context)
  }

  async fn sources(bucket: &ChallengeBucket) -> Result<Sources, CheckerError> {
    let mut sources = Sources::new();
    sources.insert(Source::memory(
      bucket
        .checker()
        .await
        .map_err(|e| CheckerError::MissingCheckerScript(e.to_string()))?,
    )?)?;
    Ok(sources)
  }

  pub async fn lint(&self, bucket: &ChallengeBucket) -> Result<(), CheckerError> {
    let context = Self::build_context().await?;
    let mut sources = Self::sources(bucket).await?;
    let mut diagnostics = Diagnostics::new();
    let _ = rune::prepare(&mut sources)
      .with_context(&context)
      .with_diagnostics(&mut diagnostics)
      .build();
    if !diagnostics.is_empty() {
      let mut out = Buffer::ansi();
      diagnostics.emit(&mut out, &sources)?;
      return Err(CheckerError::CompileError(
        (String::from_utf8(out.into_inner())?).to_string(),
      ));
    }
    let unit = rune::prepare(&mut sources).with_context(&context).build()?;
    let runtime = context.runtime()?;
    let vm = Vm::new(Arc::new(runtime), Arc::new(unit));
    vm.lookup_function(["check"])
      .map_err(|_| CheckerError::MissingFunction("check".to_owned()))?;
    vm.lookup_function(["environ"])
      .map_err(|_| CheckerError::MissingFunction("environ".to_owned()))?;
    Ok(())
  }

  pub async fn expire(&mut self, bucket: &ChallengeBucket) {
    self.contexts.write().await.remove(&bucket.hash());
  }

  pub async fn preload(
    &mut self, challenge: &challenge::Model, bucket: &ChallengeBucket,
  ) -> Result<(), CheckerError> {
    let mut contexts = self.contexts.write().await;
    if contexts.contains_key(&bucket.hash()) && challenge.updated_at < contexts[&bucket.hash()].2 {
      return Ok(());
    }
    let context = Self::build_context().await?;
    let mut sources = Self::sources(bucket).await?;

    let unit = rune::prepare(&mut sources).with_context(&context).build()?;
    let runtime = context.runtime()?;

    contexts.insert(
      bucket.hash(),
      (Arc::new(unit), Arc::new(runtime), Utc::now()),
    );
    Ok(())
  }

  /// Check the flag and return results and audit messages.
  ///
  /// ## Returns
  ///
  /// (correct: bool, msg: String, Option<(peer_team: Option<i64>, reason:
  /// String)>)
  pub async fn check(
    &self, bucket: &ChallengeBucket, user: &user::Model, team: &Option<team::Model>,
    submission: &submission::Model,
  ) -> Result<(bool, String, Option<AuditMessage>), CheckerError> {
    debug!("checking submission: {:?}", submission);
    let contexts = self.contexts.read().await;
    let (unit, runtime, _) = contexts
      .get(&bucket.hash())
      .ok_or(CheckerError::MissingCheckerScript(bucket.name.clone()))?;
    let vm = Vm::new(runtime.clone(), unit.clone());
    debug!("load user: {:?}", user);
    let user_object: RuneUser = user.into();
    debug!("load submission: {:?}", submission);
    let submission_object: RuneSubmission = submission.into();
    debug!("load team: {:?}", team);
    let team_object = match team {
      Some(team) => RuneTeam::from(team),
      None => RuneTeam::default(),
    };
    let bucket = ret2script::modules::bucket::Bucket::try_new(bucket.path())?;
    let output = vm.send_execute(
      ["check"],
      (bucket, user_object, team_object, submission_object),
    )?;
    let output = output.async_complete().await.into_result()?;
    debug!("check output: {:?}", output);
    let output: Result<(bool, String, Option<Object>), Value> = rune::from_value(output)?;
    if let Ok((result, message, audit)) = output {
      let audit = if let Some(audit) = audit {
        Some(AuditMessage {
          peer_team: rune::from_value(
            audit
              .get("peer_team")
              .ok_or(CheckerError::MissingResultField(
                "audit::peer_team".to_owned(),
              ))?
              .to_owned(),
          )?,
          reason: rune::from_value(
            audit
              .get("reason")
              .ok_or(CheckerError::MissingResultField(
                "audit::peer_team".to_owned(),
              ))?
              .to_owned(),
          )?,
        })
      } else {
        None
      };
      Ok((result, message, audit))
    } else {
      Err(CheckerError::ScriptError(
        "Early returns from script".to_owned(),
      ))
    }
  }

  pub async fn environ(
    &self, bucket: &ChallengeBucket, user: &user::Model, team: &Option<team::Model>,
  ) -> Result<HashMap<String, String>, CheckerError> {
    debug!("entering checker environ");
    let contexts = self.contexts.read().await;
    let (unit, runtime, _) = contexts
      .get(&bucket.hash())
      .ok_or(CheckerError::MissingCheckerScript(bucket.name.clone()))?;
    let vm = Vm::new(runtime.clone(), unit.clone());
    let user_object = RuneUser::from(user);
    let team_object = match team {
      Some(team) => RuneTeam::from(team),
      None => RuneTeam::default(),
    };
    let bucket = ret2script::modules::bucket::Bucket::try_new(bucket.path())?;
    debug!("calling environ");
    let output = vm.send_execute(["environ"], (bucket, user_object, team_object))?;
    let output = output.async_complete().await.into_result()?;
    debug!("environ output: {:?}", output);
    let object: Result<Object, Value> = rune::from_value(output)?;
    if let Ok(object) = object {
      let mut environ = HashMap::new();
      for (key, value) in object.iter() {
        environ.insert(key.to_string(), rune::from_value(value.clone())?);
      }
      Ok(environ)
    } else {
      Err(CheckerError::ScriptError(
        "Early returns from script".to_owned(),
      ))
    }
  }

  pub async fn cleanup(&mut self) {
    let now = Utc::now();
    self.contexts.write().await.retain(|_, (_, _, time)| {
      let duration = now.signed_duration_since(*time);
      duration.num_hours() < 1
    });
  }

  pub async fn cleanup_worker(&mut self) {
    loop {
      tokio::time::sleep(tokio::time::Duration::from_secs(15 * 60)).await;
      tracing::debug!("Running checker cleanup...");
      self.cleanup().await;
      tracing::trace!("Live checkers: {:?}", self.contexts.read().await.keys());
    }
  }
}

pub async fn initialize() -> Checker {
  let checker = Checker::default();
  let mut checker_worker = checker.clone();
  tokio::spawn(async move { checker_worker.cleanup_worker().await });
  checker
}

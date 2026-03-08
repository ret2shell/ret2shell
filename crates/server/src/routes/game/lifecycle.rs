use chrono::Utc;
use r2s_cache::Cache;
use r2s_cluster::{
  ChallengeEnvSnapshot, Cluster, Pod,
  lifecycle::{
    LifecycleChallengeInfo, LifecycleEvent, LifecycleExecutionRequest, LifecycleExecutionStatus,
    LifecycleStopReason, LifecycleTeamInfo, LifecycleUserInfo,
  },
};
use r2s_database::{challenge, config, game, team, user};
use r2s_engine::Engine;
use tracing::{Instrument, Span, error, error_span, info, warn};

use crate::{middleware::auth::Token, traits::GlobalState};

#[derive(Clone, Copy, Debug)]
enum ScriptScope {
  Global,
  Game,
}

impl ScriptScope {
  const fn as_str(self) -> &'static str {
    match self {
      Self::Global => "global",
      Self::Game => "game",
    }
  }
}

#[derive(Clone, Debug)]
struct ResolvedLifecycleScript {
  key: String,
  script: String,
  scope: ScriptScope,
}

#[derive(Clone)]
struct LifecycleHookContext {
  cluster: Cluster,
  engine: Engine,
  config: config::Model,
  game: game::Model,
  challenge: LifecycleChallengeInfo,
  user: LifecycleUserInfo,
  team: Option<LifecycleTeamInfo>,
  trace_id: Option<String>,
}

pub(crate) struct RequestLifecycleHooks {
  pub(crate) state: GlobalState,
  pub(crate) config: config::Model,
  pub(crate) game: game::Model,
  pub(crate) challenge: challenge::Model,
  pub(crate) token: Token,
  pub(crate) team: Option<team::Model>,
  pub(crate) snapshots: Vec<ChallengeEnvSnapshot>,
  pub(crate) event: LifecycleEvent,
  pub(crate) trace_id: String,
}

pub fn user_info_from_token(token: &Token) -> LifecycleUserInfo {
  LifecycleUserInfo {
    id: token.id,
    account: token.account.clone(),
    nickname: token.nickname.clone(),
    institute_id: None,
  }
}

pub fn user_info_from_model(user: &user::Model) -> LifecycleUserInfo {
  LifecycleUserInfo {
    id: user.id,
    account: user.account.clone(),
    nickname: user.nickname.clone(),
    institute_id: user.institute_id,
  }
}

pub fn team_info_from_model(team: &team::Model) -> LifecycleTeamInfo {
  LifecycleTeamInfo {
    id: Some(team.id),
    name: Some(team.name.clone()),
    institute_id: team.institute_id,
    token: team.token.clone(),
  }
}

pub fn challenge_info_from_model(challenge: &challenge::Model) -> LifecycleChallengeInfo {
  LifecycleChallengeInfo {
    id: challenge.id,
    name: challenge.name.clone(),
    game_id: challenge.game_id,
  }
}

fn lifecycle_request_span(
  trace_id: Option<&str>, game: &game::Model, challenge: &LifecycleChallengeInfo,
  user: &LifecycleUserInfo, team: Option<&LifecycleTeamInfo>,
) -> Span {
  let span = error_span!(
    "request",
    trace=%trace_id.unwrap_or("UNKNOWN"),
    "user-id"=tracing::field::Empty,
    "user-account"=tracing::field::Empty,
    "user-nickname"=tracing::field::Empty,
    "team-id"=tracing::field::Empty,
    "team-name"=tracing::field::Empty,
    "data-challenge-id"=tracing::field::Empty,
    "data-challenge-name"=tracing::field::Empty,
    "data-game-id"=tracing::field::Empty,
    "data-game-name"=tracing::field::Empty,
  );

  if user.id > 0 {
    span.record("user-id", user.id);
  }
  if !user.account.is_empty() {
    span.record("user-account", user.account.as_str());
  }
  if !user.nickname.is_empty() {
    span.record("user-nickname", user.nickname.as_str());
  }
  if let Some(team) = team {
    if let Some(team_id) = team.id
      && team_id > 0
    {
      span.record("team-id", team_id);
    }
    if let Some(team_name) = team.name.as_deref()
      && !team_name.is_empty()
    {
      span.record("team-name", team_name);
    }
  }
  if challenge.id > 0 {
    span.record("data-challenge-id", challenge.id);
  }
  if !challenge.name.is_empty() {
    span.record("data-challenge-name", challenge.name.as_str());
  }
  if game.id > 0 {
    span.record("data-game-id", game.id);
  }
  if !game.name.is_empty() {
    span.record("data-game-name", game.name.as_str());
  }

  span
}

fn pod_label(pod: &Pod, key: &str) -> Option<String> {
  pod.metadata.labels.as_ref()?.get(key).cloned()
}

fn pod_annotation(pod: &Pod, key: &str) -> Option<String> {
  pod.metadata.annotations.as_ref()?.get(key).cloned()
}

fn fallback_user_info(snapshot: &ChallengeEnvSnapshot) -> LifecycleUserInfo {
  LifecycleUserInfo {
    id: pod_label(&snapshot.pod, "ret.sh.cn/user")
      .and_then(|value| value.parse::<i64>().ok())
      .unwrap_or_default(),
    account: pod_annotation(&snapshot.pod, "ret.sh.cn/user").unwrap_or_default(),
    nickname: pod_annotation(&snapshot.pod, "ret.sh.cn/user-nickname").unwrap_or_default(),
    institute_id: None,
  }
}

fn fallback_team_info(snapshot: &ChallengeEnvSnapshot) -> Option<LifecycleTeamInfo> {
  let id = pod_label(&snapshot.pod, "ret.sh.cn/team")
    .and_then(|value| value.parse::<i64>().ok())
    .filter(|value| *value > 0)?;
  Some(LifecycleTeamInfo {
    id: Some(id),
    name: pod_annotation(&snapshot.pod, "ret.sh.cn/team"),
    institute_id: None,
    token: None,
  })
}

fn fallback_challenge_info(
  snapshot: &ChallengeEnvSnapshot, game_id: i64,
) -> LifecycleChallengeInfo {
  LifecycleChallengeInfo {
    id: pod_label(&snapshot.pod, "ret.sh.cn/challenge")
      .and_then(|value| value.parse::<i64>().ok())
      .unwrap_or_default(),
    name: pod_annotation(&snapshot.pod, "ret.sh.cn/challenge").unwrap_or_default(),
    game_id,
  }
}

async fn load_platform_config(state: &GlobalState) -> Option<config::Model> {
  if let Ok(Some(config)) = state.cache.at("platform").get("config").await {
    return Some(config);
  }
  match config::get(&state.db.conn).await {
    Ok(dynamic_config) => {
      let config = dynamic_config
        .unwrap_or_default()
        .merge(state.config.clone());
      state.cache.at("platform").set("config", &config).await.ok();
      Some(config)
    }
    Err(err) => {
      error!(error=?err, "failed to load platform config for lifecycle hooks");
      None
    }
  }
}

fn resolve_lifecycle_script(
  config: &config::Model, game: &game::Model,
) -> Result<Option<ResolvedLifecycleScript>, String> {
  let Some(cluster_config) = &config.cluster else {
    return Ok(None);
  };
  if game.archive_at > Utc::now()
    && let Some(lifecycle) = game.lifecycle.clone()
  {
    let key = game.bucket.clone().ok_or_else(|| {
      format!(
        "game {}:{} missing bucket for lifecycle",
        game.id, game.name
      )
    })?;
    return Ok(Some(ResolvedLifecycleScript {
      key,
      script: lifecycle,
      scope: ScriptScope::Game,
    }));
  }
  Ok(Some(ResolvedLifecycleScript {
    key: "default".to_owned(),
    script: cluster_config.lifecycle.clone().unwrap_or_default(),
    scope: ScriptScope::Global,
  }))
}

async fn cleanup_traffic_cache(cache: Cache, snapshots: &[ChallengeEnvSnapshot]) {
  for snapshot in snapshots {
    if let Some(traffic) = pod_label(&snapshot.pod, "ret.sh.cn/traffic") {
      cache.at("traffic").del(traffic).await.ok();
    }
  }
}

async fn trigger_lifecycle_for_snapshots(
  context: LifecycleHookContext, snapshots: Vec<ChallengeEnvSnapshot>, event: LifecycleEvent,
) {
  let span = lifecycle_request_span(
    context.trace_id.as_deref(),
    &context.game,
    &context.challenge,
    &context.user,
    context.team.as_ref(),
  );

  async move {
    let LifecycleHookContext {
      cluster,
      engine,
      config,
      game,
      challenge,
      user,
      team,
      trace_id: _,
    } = context;
    let event_name = event.name();
    let stop_reason = event.reason().map(|reason| reason.as_str()).unwrap_or("");

    let Some(mapper) = cluster.lifecycle.clone() else {
      error!(event=%event_name, "lifecycle mapper is not initialized");
      return;
    };
    let resolved = match resolve_lifecycle_script(&config, &game) {
      Ok(resolved) => resolved,
      Err(err) => {
        error!(event=%event_name, error=%err, "failed to resolve lifecycle script");
        return;
      }
    };
    let Some(resolved) = resolved else {
      for snapshot in snapshots {
        let pod_name = snapshot.pod.metadata.name.clone().unwrap_or_default();
        info!(
          event=%event_name,
          pod=%pod_name,
          outcome="skipped",
          reason="cluster config missing",
          "lifecycle hook skipped"
        );
      }
      return;
    };
    let scope = resolved.scope.as_str();
    if resolved.script.trim().is_empty() {
      for snapshot in snapshots {
        let pod_name = snapshot.pod.metadata.name.clone().unwrap_or_default();
        info!(
          event=%event_name,
          scope=%scope,
          pod=%pod_name,
          outcome="skipped",
          reason="script empty",
          "lifecycle hook skipped"
        );
      }
      return;
    }
    if let Err(err) = mapper
      .preload(&engine, &resolved.key, &resolved.script)
      .await
    {
      error!(
        event=%event_name,
        scope=%scope,
        error=?err,
        "failed to preload lifecycle script"
      );
      return;
    }
    for snapshot in snapshots {
      let pod_name = snapshot.pod.metadata.name.clone().unwrap_or_default();
      match mapper
        .execute(
          &engine,
          &resolved.key,
          LifecycleExecutionRequest {
            event,
            snapshot: &snapshot,
            user: user.clone(),
            team: team.clone(),
            challenge: challenge.clone(),
          },
        )
        .await
      {
        Ok(LifecycleExecutionStatus::Executed) => info!(
          event=%event_name,
          reason=%stop_reason,
          scope=%scope,
          pod=%pod_name,
          outcome="executed",
          "lifecycle hook executed"
        ),
        Ok(LifecycleExecutionStatus::Skipped) => info!(
          event=%event_name,
          reason=%stop_reason,
          scope=%scope,
          pod=%pod_name,
          outcome="skipped",
          reason_detail="function missing",
          "lifecycle hook skipped"
        ),
        Err(err) => error!(
          event=%event_name,
          reason=%stop_reason,
          scope=%scope,
          pod=%pod_name,
          error=?err,
          outcome="failed",
          "lifecycle hook failed"
        ),
      }
    }
  }
  .instrument(span)
  .await;
}

pub fn spawn_request_hooks(request: RequestLifecycleHooks) {
  let RequestLifecycleHooks {
    state,
    config,
    game,
    challenge,
    token,
    team,
    snapshots,
    event,
    trace_id,
  } = request;
  if snapshots.is_empty() {
    return;
  }
  let context = LifecycleHookContext {
    cluster: state.cluster.clone(),
    engine: state.engine.clone(),
    config,
    game,
    challenge: challenge_info_from_model(&challenge),
    user: user_info_from_token(&token),
    team: team.as_ref().map(team_info_from_model),
    trace_id: Some(trace_id),
  };
  tokio::spawn(async move {
    if !matches!(event, LifecycleEvent::Start) {
      cleanup_traffic_cache(state.cache.clone(), &snapshots).await;
    }
    trigger_lifecycle_for_snapshots(context, snapshots, event).await;
  });
}

pub fn spawn_timeout_stop_hooks(state: GlobalState, snapshots: Vec<ChallengeEnvSnapshot>) {
  if snapshots.is_empty() {
    return;
  }
  tokio::spawn(async move {
    cleanup_traffic_cache(state.cache.clone(), &snapshots).await;
    let Some(config) = load_platform_config(&state).await else {
      return;
    };
    for snapshot in snapshots {
      let Some(game_id) =
        pod_label(&snapshot.pod, "ret.sh.cn/game").and_then(|value| value.parse::<i64>().ok())
      else {
        warn!(pod=?snapshot.pod.metadata.name, "missing game id for timeout lifecycle hook");
        continue;
      };
      let game = match game::get(&state.db.conn, game_id).await {
        Ok(Some(game)) => game,
        Ok(None) => {
          warn!(game_id, pod=?snapshot.pod.metadata.name, "game missing for timeout lifecycle hook");
          continue;
        }
        Err(err) => {
          error!(game_id, pod=?snapshot.pod.metadata.name, error=?err, "failed to load game for timeout lifecycle hook");
          continue;
        }
      };
      let challenge = match pod_label(&snapshot.pod, "ret.sh.cn/challenge")
        .and_then(|value| value.parse::<i64>().ok())
      {
        Some(challenge_id) => match challenge::get(&state.db.conn, challenge_id).await {
          Ok(Some(challenge)) => challenge_info_from_model(&challenge),
          Ok(None) => fallback_challenge_info(&snapshot, game.id),
          Err(err) => {
            error!(challenge_id, game_id=%game.id, pod=?snapshot.pod.metadata.name, error=?err, "failed to load challenge for timeout lifecycle hook");
            fallback_challenge_info(&snapshot, game.id)
          }
        },
        None => fallback_challenge_info(&snapshot, game.id),
      };
      let user = match pod_label(&snapshot.pod, "ret.sh.cn/user")
        .and_then(|value| value.parse::<i64>().ok())
      {
        Some(user_id) => match user::get(&state.db.conn, user_id).await {
          Ok(Some(user)) => user_info_from_model(&user),
          Ok(None) => fallback_user_info(&snapshot),
          Err(err) => {
            error!(user_id, game_id=%game.id, pod=?snapshot.pod.metadata.name, error=?err, "failed to load user for timeout lifecycle hook");
            fallback_user_info(&snapshot)
          }
        },
        None => fallback_user_info(&snapshot),
      };
      let team = match pod_label(&snapshot.pod, "ret.sh.cn/team")
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
      {
        Some(team_id) => match team::get(&state.db.conn, team_id).await {
          Ok(Some(team)) => Some(team_info_from_model(&team)),
          Ok(None) => fallback_team_info(&snapshot),
          Err(err) => {
            error!(team_id, game_id=%game.id, pod=?snapshot.pod.metadata.name, error=?err, "failed to load team for timeout lifecycle hook");
            fallback_team_info(&snapshot)
          }
        },
        None => None,
      };
      trigger_lifecycle_for_snapshots(
        LifecycleHookContext {
          cluster: state.cluster.clone(),
          engine: state.engine.clone(),
          config: config.clone(),
          game,
          challenge,
          user,
          team,
          trace_id: None,
        },
        vec![snapshot],
        LifecycleEvent::Stop(LifecycleStopReason::Timeout),
      )
      .await;
    }
  });
}

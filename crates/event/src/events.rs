use r2s_database::{challenge, submission, team, user};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChallengeEventType {
  Up,
  Down,
  NewHint,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ChallengeEvent {
  pub challenge: challenge::Model,
  pub operator: user::Model,
  pub event_type: ChallengeEventType,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmissionEventType {
  Correct,
  Cheated,
  TooQuick,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SubmissionEvent {
  pub submission: submission::Model,
  pub blood_state: Option<i32>,
  pub operator: user::Model,
  pub team: Option<team::Model>,
  pub challenge: challenge::Model,
  pub peer_team: Option<team::Model>,
  pub reason: Option<String>,
  pub event_type: SubmissionEventType,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GameEventType {
  Freeze,
  Unfreeze,
  NewNotification,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GameEvent {
  pub operator: user::Model,
  pub event_type: GameEventType,
  pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatEventType {
  Message,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ChatEvent {
  pub operator: user::Model,
  pub team: team::Model,
  pub challenge: challenge::Model,
  pub event_type: ChatEventType,
  pub content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DevopsEventType {
  ClusterOverloaded,
  ClusterRecovered,
  ServerPanic,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DevopsEvent {
  pub event_type: DevopsEventType,
  pub running: Option<i64>,
  pub pending: Option<i64>,
  pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Event {
  Challenge(ChallengeEvent),
  Submission(Box<SubmissionEvent>),
  Game(GameEvent),
  Chat(Box<ChatEvent>),
  Devops(Box<DevopsEvent>),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EventContainer {
  pub game_id: i64,
  pub event: Event,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub enum Broadcast {
  Publish(Box<EventContainer>),
  Heartbeat,
}

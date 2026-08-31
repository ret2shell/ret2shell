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

#[cfg(test)]
mod tests {
  use chrono::Utc;
  use r2s_database::{challenge, submission, team, user};

  use super::{
    Broadcast, ChallengeEvent, ChallengeEventType, ChatEvent, ChatEventType, DevopsEvent,
    DevopsEventType, Event, EventContainer, GameEvent, GameEventType, SubmissionEvent,
    SubmissionEventType,
  };

  fn sample_user() -> user::Model {
    user::Model {
      account: "player".to_owned(),
      nickname: "Player".to_owned(),
      ..Default::default()
    }
  }

  fn sample_challenge() -> challenge::Model {
    challenge::Model {
      name: "babycrypto".to_owned(),
      updated_at: Utc::now(),
      ..Default::default()
    }
  }

  #[test]
  fn event_type_tags_are_snake_case() {
    assert_eq!(
      serde_json::to_value(ChallengeEventType::NewHint).unwrap(),
      "new_hint"
    );
    assert_eq!(
      serde_json::to_value(SubmissionEventType::TooQuick).unwrap(),
      "too_quick"
    );
    assert_eq!(
      serde_json::to_value(GameEventType::Unfreeze).unwrap(),
      "unfreeze"
    );
    assert_eq!(
      serde_json::to_value(ChatEventType::Message).unwrap(),
      "message"
    );
    assert_eq!(
      serde_json::to_value(DevopsEventType::ClusterOverloaded).unwrap(),
      "cluster_overloaded"
    );
  }

  #[test]
  fn event_container_round_trips_boxed_submission_event() {
    let event = EventContainer {
      game_id: 7,
      event: Event::Submission(Box::new(SubmissionEvent {
        submission: submission::Model {
          id: 1,
          created_at: Utc::now(),
          user_id: 1,
          challenge_id: 1,
          team_id: None,
          content: Some("flag{demo}".to_owned()),
          solved: Some(true),
          result: None,
        },
        blood_state: Some(1),
        operator: sample_user(),
        team: Some(team::Model {
          name: "team-a".to_owned(),
          ..Default::default()
        }),
        challenge: sample_challenge(),
        peer_team: None,
        reason: None,
        event_type: SubmissionEventType::Correct,
      })),
    };

    let encoded = serde_json::to_string(&event).unwrap();
    let decoded: EventContainer = serde_json::from_str(&encoded).unwrap();

    assert_eq!(decoded.game_id, 7);
    match decoded.event {
      Event::Submission(submission) => {
        assert!(matches!(
          submission.event_type,
          SubmissionEventType::Correct
        ));
        assert_eq!(submission.blood_state, Some(1));
        assert_eq!(submission.team.unwrap().name, "team-a");
      }
      _ => panic!("expected submission event"),
    }
  }

  #[test]
  fn challenge_game_chat_and_devops_events_round_trip() {
    let events = vec![
      Event::Challenge(ChallengeEvent {
        challenge: sample_challenge(),
        operator: sample_user(),
        event_type: ChallengeEventType::Down,
      }),
      Event::Game(GameEvent {
        operator: sample_user(),
        event_type: GameEventType::Freeze,
        message: "game frozen".to_owned(),
      }),
      Event::Chat(Box::new(ChatEvent {
        operator: sample_user(),
        team: team::Model {
          name: "team-a".to_owned(),
          ..Default::default()
        },
        challenge: sample_challenge(),
        event_type: ChatEventType::Message,
        content: "any hint?".to_owned(),
      })),
      Event::Devops(Box::new(DevopsEvent {
        event_type: DevopsEventType::ServerPanic,
        running: Some(3),
        pending: Some(1),
        message: Some("worker crashed".to_owned()),
      })),
    ];

    for event in events {
      let container = EventContainer { game_id: 1, event };
      let encoded = serde_json::to_string(&container).unwrap();
      let decoded: EventContainer = serde_json::from_str(&encoded).unwrap();
      assert_eq!(serde_json::to_string(&decoded).unwrap(), encoded);
    }

    let heartbeat: Broadcast =
      serde_json::from_str(&serde_json::to_string(&Broadcast::Heartbeat).unwrap()).unwrap();
    assert!(matches!(heartbeat, Broadcast::Heartbeat));
  }
}

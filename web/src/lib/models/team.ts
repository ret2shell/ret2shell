import type { DateTime } from 'luxon'

export enum TeamState {
  Banned = 0,
  Pending = 1,
  Hidden = 2,
  Passed = 3,
}

export type TeamScoreHistory = {
  score: number
  changed_at: DateTime
  challenge_id: number | null
  blood_state: number | null
}

export type Team = {
  id: number
  name: string
  game_id: number
  token: string | null
  state: TeamState
  institute_id: number | null
  institute_name?: string
  score: number
  history: TeamScoreHistory[]
  last_active_at: DateTime
}

export function stringifyState(state: TeamState) {
  switch (state) {
    case TeamState.Banned:
      return 'Banned'
    case TeamState.Pending:
      return 'Pending'
    case TeamState.Hidden:
      return 'Hidden'
    case TeamState.Passed:
      return 'Passed'
  }
}

export function coloredState(state: TeamState) {
  switch (state) {
    case TeamState.Banned:
      return 'error'
    case TeamState.Pending:
      return 'warning'
    case TeamState.Hidden:
      return 'layer-content'
    case TeamState.Passed:
      return 'success'
  }
}

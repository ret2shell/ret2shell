import { DateTime } from 'luxon'

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
  institute_id: number
  institute_name?: string
  score: number
  history: TeamScoreHistory[]
  last_active_at: DateTime
}

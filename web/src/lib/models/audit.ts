import { DateTime } from 'luxon'

export enum AuditState {
  Pending = 0,
  Misjudged = 1,
  Confirmed = 2,
}

export type Audit = {
  id: number
  created_at: DateTime
  reason: string
  challenge_id: number
  challenge_name?: string
  user_id: number
  user_name?: string
  team_id: number
  team_name?: string
  game_id: number
  game_name?: string
  state: AuditState
}

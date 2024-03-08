import { DateTime } from 'luxon'

export type Extra = {
  id: number
  created_at: DateTime
  reason: string
  score: number
  hint_id: number
  team_id: number
  team_name?: string
  challenge_id: number
  challenge_name?: string
}

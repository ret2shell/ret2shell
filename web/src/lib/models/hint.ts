import { DateTime } from 'luxon'

export type Hint = {
  id: number
  created_at: DateTime
  challenge_id: number
  content: string
  cost: number
  release_at: DateTime
  no_solves_only: boolean
}

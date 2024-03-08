import { DateTime } from 'luxon'

export type Calendar = {
  id: number
  name: string
  intro: string | null
  link: string
  start_at: DateTime
  end_at: DateTime
  reporter_id: number
  reporter_name?: string
}

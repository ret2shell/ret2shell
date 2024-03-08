import { DateTime } from 'luxon'

export type Notification = {
  id: number
  title: string
  content: string
  published_at: DateTime
  game_id: number
  uploader_id: number
  uploader_name?: string
}

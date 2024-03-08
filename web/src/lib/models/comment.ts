import { DateTime } from 'luxon'

export type Comment = {
  id: number
  created_at: DateTime
  article_id: number
  article_title?: string
  publisher_id: number
  publisher_name?: string
  content: string
}

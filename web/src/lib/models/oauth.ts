import { DateTime } from 'luxon'

export type Oauth = {
  id: number
  user_id: number
  user_name?: string
  institute_id: number
  institute_name?: string
  provider: string
  data: { [key: string]: string }
  created_at: DateTime
  updated_at: DateTime
}

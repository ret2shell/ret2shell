import type { DateTime } from 'luxon'

export enum Permission {
  Basic = 0,
  Verified = 1,
  Calendar = 2,
  Wiki = 3,
  Bulletin = 4,
  Game = 5,
  Host = 6,
  User = 7,
  Statistics = 8,
  DevOps = 9,
}

export type User = {
  id: number
  registered_at: DateTime
  account: string
  nickname: string
  email: string | null
  description: string | null
  avatar: string | null
  institute_id: number
  institute_name?: string
  permissions: Permission[]
  hidden: boolean
  banned: boolean
}

export type Token = {
  id: number
  account: string
  nickname: string
  permissions: Permission[]
}

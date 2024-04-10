import { DateTime } from 'luxon'

export enum Permission {
  Basic,
  Verified,
  Calendar,
  Wiki,
  Bulletin,
  Game,
  Host,
  User,
  Statistics,
  DevOps,
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

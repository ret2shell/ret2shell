import { DateTime } from 'luxon'

export enum HostType {
  CTFTraining = 0,
  CTFGame = 1,
}

export type GameAccessPolicy = {
  restrict: boolean
  institutes: number[]
}

export type Game = {
  id: number
  updated_at: DateTime
  name: string
  brief: string
  introduction_id: number
  start_at: DateTime
  end_at: DateTime
  register_at: DateTime
  archive_at: DateTime
  hidden: boolean
  offline: boolean
  frozen: boolean
  host_type: HostType
  team_size: number
  access_policy: GameAccessPolicy
  cover: string | null
  logo: string | null
  enable_audit: boolean
  can_register_after_started: boolean
  award_rate: number
}

import { DateTime } from 'luxon'

export type ContainerConfig = {
  image: string
  cpu: string
  memory: string
  storage: string
}

export type InstanceConfig = {
  containers: ContainerConfig[]
  port: number
}

export enum InstanceState {
  Pending,
  Running,
  Succeeded,
  Failed,
}

export type Instance = {
  id: number
  name: string
  inner_addr: string | null
  proxy_addr: string | null
  data: { [key: string]: string } | null
  renew_count: number
  started_at: DateTime
  created_at: DateTime
  stoped_at: DateTime | null
  user_id: number
  user_name?: string
  team_id: number | null
  team_name?: string | null
  challenge_id: number
  challenge_name?: string
  state: InstanceState
  config: InstanceConfig
}

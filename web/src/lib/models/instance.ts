export type Instance = {
  id: number
  name: string
  inner_addr: string | null
  proxy_addr: string | null
  data: { [key: string]: string } | null
  renew_count: number
  started_at: number
  user_id: number
  user_name?: string
  team_id: number | null
  team_name?: string | null
  challenge_id: number
  challenge_name?: string
  running: boolean
}

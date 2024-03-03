export type Submission = {
  id: number
  created_at: number
  user_id: number
  user_name?: string
  team_id: number
  team_name?: string
  challenge_id: number
  challenge_name?: string
  content: string | null
  solved: boolean
}

export type Challenge = {
  id: number
  name: string
  updated_at: number
  content: string | null
  hidden: boolean
  game_id: number
  tag: { name: string; primary: boolean }[]
  score_rule: { initial: number; minimum: number; decay: number }
  score: number
  bucket: string | null
}

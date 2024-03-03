export enum ArticleAccessPolicy {
  Bulletin = 0,
  Wiki = 1,
  Game = 2,
  WriteUp = 3,
  Answer = 4,
}

export type Article = {
  id: number
  created_at: number
  updated_at: number
  title: string
  content: string | null
  publisher_id: number
  publisher_name?: string
  access_policy: ArticleAccessPolicy
  enable_comment: boolean
  weight: number
  draft: boolean
  published: boolean
}

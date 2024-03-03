export type Comment = {
  id: number
  created_at: number
  article_id: number
  article_name?: string
  publisher_id: number
  publisher_name?: string
  content: string
}

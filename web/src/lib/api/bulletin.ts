import { SearchParamsOption } from '@reverier/ky'
import api, { api_root } from '.'
import { Article } from '../models/article'

export async function getBulletinList(page: number, page_size: number) {
  return await api
    .get(`${api_root}/bulletin`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
    .json<[Article[], number]>()
}

export async function getBulletin(id: number) {
  return await api.get(`${api_root}/bulletin/${id}`).json<Article>()
}

export async function createBulletin(article: Article) {
  return await api.post(`${api_root}/bulletin`, { json: article }).json<Article>()
}

export async function updateBulletin(article: Article) {
  return await api.patch(`${api_root}/bulletin/${article.id}`, { json: article }).json<Article>()
}

export async function deleteBulletin(id: number) {
  return await api.delete(`${api_root}/bulletin/${id}`).json()
}

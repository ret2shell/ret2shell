import api, { api_root } from '.'
import { Article } from '../models/article'
import { Game, HostType } from '../models/game'

export async function getGames(page?: number, page_size?: number, host_type?: HostType, weight?: number) {
  return (
    await api.get(`${api_root}/game`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
          host_type,
          weight,
        })
      ),
    })
  ).json<[Game[], number]>()
}

export async function getGame(id: number) {
  return await api.get(`${api_root}/game/${id}`).json<Game>()
}

export async function createGame(game: Game) {
  return await api.post(`${api_root}/game`, { json: game }).json<Game>()
}

export async function updateGame(id: number, game: Game) {
  return await api.patch(`${api_root}/game/${id}`, { json: game }).json<Game>()
}

export async function deleteGame(id: number) {
  return await api.delete(`${api_root}/game/${id}`).json<null>()
}

export async function getGameIntroduction(id: number) {
  return await api.get(`${api_root}/game/${id}/introduction`).json<Article>()
}

export async function updateGameIntroduction(id: number, article: Article) {
  return await api.patch(`${api_root}/game/${id}/introduction`, { json: article }).json<Article>()
}

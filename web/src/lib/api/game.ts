import api, { api_root } from '.'
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

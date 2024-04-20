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

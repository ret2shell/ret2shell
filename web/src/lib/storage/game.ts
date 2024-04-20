import { createStore } from 'solid-js/store'
import { Game } from '@models/game'
import { Team } from '@models/team'
import { User } from '@models/user'

export const [gameStore, setGameStore] = createStore({
  games: [] as Game[],
  current: null as Game | null,
  preload: null as Game | null,
  team: null as Team | null,
  members: [] as User[],
})

export function appendGames(games: Game[]) {
  const ids = new Set(gameStore.games.map(g => g.id))
  setGameStore({ games: [...gameStore.games.filter(g => !ids.has(g.id)), ...games] })
}

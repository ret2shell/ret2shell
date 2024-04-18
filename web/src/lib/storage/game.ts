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

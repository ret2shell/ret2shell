import { createStore } from 'solid-js/store'
import { Game } from '@models/game'
import { Team } from '@models/team'
import { Permission, User } from '@models/user'
import { DateTime } from 'luxon'
import { accountStore } from './account'
import { Challenge } from '../models/challenge'

export const [gameStore, setGameStore] = createStore({
  games: [] as Game[],
  current: null as Game | null,
  preload: null as Game | null,
  team: null as Team | null,
  rank: null as number | null,
  score: null as number | null,
  members: [] as User[],
  challenges: [] as Challenge[],
})

export function appendGames(games: Game[]) {
  const ids = new Set(gameStore.games.map(g => g.id))
  setGameStore({ games: [...gameStore.games.filter(g => !ids.has(g.id)), ...games] })
}

export const canParticipate = () => {
  if (
    !gameStore.current?.can_register_after_started &&
    gameStore.current?.start_at &&
    gameStore.current.start_at < DateTime.now()
  ) {
    return false
  }
  if (gameStore.current?.end_at && gameStore.current.end_at < DateTime.now()) {
    return false
  }
  if (
    accountStore.id &&
    accountStore.permissions.includes(Permission.Game) &&
    gameStore.current?.admins.includes(accountStore.id)
  ) {
    return false
  }
  if (accountStore.permissions.includes(Permission.Host)) {
    return false
  }
  if (gameStore.current?.access_policy.restrict) {
    if (
      accountStore.info?.institute_id &&
      gameStore.current.access_policy.institutes.includes(accountStore.info.institute_id)
    )
      return true
    return false
  }

  return true
}

export const canAccessChallenges = () => {
  if (!accountStore.id) return false
  if (
    gameStore.current?.admins &&
    (accountStore.permissions.includes(Permission.Host) ||
      (gameStore.current.admins.includes(accountStore.id) && accountStore.permissions.includes(Permission.Game)))
  ) {
    return true
  }
  if (gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()) {
    return false
  }
  if (gameStore.current?.archive_at && gameStore.current.archive_at < DateTime.now()) {
    return false
  }
  if (
    gameStore.current?.start_at &&
    gameStore.current.start_at < DateTime.now() &&
    gameStore.current.archive_at &&
    gameStore.current.archive_at > DateTime.now()
  ) {
    if (gameStore.team) {
      return true
    }
  }
  return false
}
export const isGameAdmin = () => {
  if (!accountStore.id) return false
  if (
    gameStore.current?.admins &&
    (accountStore.permissions.includes(Permission.Host) ||
      (gameStore.current.admins.includes(accountStore.id) && accountStore.permissions.includes(Permission.Game)))
  ) {
    return true
  }
  return false
}

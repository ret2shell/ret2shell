import { createStore } from 'solid-js/store'
import { Game } from '@models/game'
import { Team } from '@models/team'
import { User } from '@models/user'
import { DateTime } from 'luxon'

export const [gameStore, setgameStore] = createStore({
  games: [
    {
      id: 1,
      updated_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      name: 'Game 1',
      brief: 'Game 1 Brief',
      start_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      end_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      register_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      archive_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      cover:
        'https://ctf.xidian.edu.cn/api/media/86/20/86209121a800702d7d1cc6aa8f4b6dcb87f9a2c9b8f689ee7f699c4d8df26642.webp',
    },
    {
      id: 2,
      updated_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      name: 'Game 2',
      brief: 'Game 2 Brief',
      start_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      end_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      register_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      archive_at: DateTime.fromFormat('2021-01-01', 'yyyy-MM-dd'),
      cover:
        'https://ctf.xidian.edu.cn/api/media/11/d2/11d2d8f660bb776a9dc14ef4276ba2810d3861ddb90b4f7e9cee1fed4b2a7b7f.webp',
    },
  ] as Game[],
  current: null as Game | null,
  team: null as Team | null,
  members: [] as User[],
})

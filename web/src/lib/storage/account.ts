import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'
import { User } from '../models/user'

export const [accountStore, setAccountStore] = makePersisted(
  createStore({
    name: 'Reverier' as string | null,
    token: 'adfasdfasfsdf' as string | null,
    info: {
      id: 1,
      nickname: 'Reverier',
      avatar: 'https://avatars.githubusercontent.com/u/41937333?v=4',
    } as User | null,
  }),
  { name: 'account' }
)

export const userReset = () => {
  setAccountStore({ name: null, token: null, info: null })
}

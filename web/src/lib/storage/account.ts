import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'

export const [accountStore, setAccountStore] = makePersisted(
  createStore({
    name: null as string | null,
    token: null as string | null,
  }),
  { name: 'account' }
)

export const userReset = () => {
  setAccountStore({ name: null, token: null })
}

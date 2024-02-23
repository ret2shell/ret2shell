import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'

export const [platformStore, setPlatformStore] = makePersisted(
  createStore({
    name: null as string | null,
  }),
  { name: 'platform' }
)

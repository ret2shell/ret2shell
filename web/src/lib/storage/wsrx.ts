import { createStore } from 'solid-js/store'
import { Instance, Traffic } from '@models/instance'

export const [wsrxStore, setWsrxStore] = createStore({
  daemon: null as string | null,
  instances: [] as Instance[],
  traffics: [] as Traffic[],
})

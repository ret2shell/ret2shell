import { createStore } from 'solid-js/store'
import { Instance, InstanceState, Traffic } from '../models/instance'
import { DateTime } from 'luxon'

export const [wsrxStore, setWsrxStore] = createStore({
  daemon: null as string | null,
  instances: [] as Instance[],
  traffics: [] as Traffic[],
})

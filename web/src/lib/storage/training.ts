import { createStore } from 'solid-js/store'
import { Game } from '@models/game'
import { Challenge } from '../models/challenge'

export const [trainingStore, setTrainingStore] = createStore({
  current: null as Game | null,
  challenges: [] as Challenge[],
})

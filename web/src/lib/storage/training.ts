import { createStore } from 'solid-js/store'
import { Game } from '@models/game'
import { Challenge } from '../models/challenge'
import { Submission } from '../models/submission'

export const [trainingStore, setTrainingStore] = createStore({
  current: null as Game | null,
  challenges: [] as Challenge[],
  solves: [] as Submission[],
})

export type TrainingStoreType = typeof trainingStore

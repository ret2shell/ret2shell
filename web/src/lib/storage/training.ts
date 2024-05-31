import type { Game } from "@models/game";
import { createStore } from "solid-js/store";
import type { Challenge } from "../models/challenge";
import type { Submission } from "../models/submission";

export const [trainingStore, setTrainingStore] = createStore({
    current: null as Game | null,
    challenges: [] as Challenge[],
    solves: [] as Submission[],
});

export type TrainingStoreType = typeof trainingStore;

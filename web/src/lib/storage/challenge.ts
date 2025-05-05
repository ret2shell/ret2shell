import { handleHttpError } from "@api";
import {
  getChallenge,
  getChallengeAttachments,
  getChallengeEnv,
  getChallengeList,
  getChallengeSolveStatus,
  getSelfSolves,
} from "@api/game";
import type { Challenge, ChallengeEnv } from "@models/challenge";
import type { Submission } from "@models/submission";
import { createStore } from "solid-js/store";
import { gameStore } from "./game";
import { t } from "./theme";

type FileType = "static" | "mapped" | "checker";
type Attachment = { file: string; folder: FileType };

export const [challengeStore, setChallengeStore] = createStore({
  current: null as Challenge | null,
  status: null as {
    solved: boolean;
    solves: number;
  } | null,
  challenges: [] as Challenge[],
  files: [] as Attachment[],
  adminFiles: [] as Attachment[],
  env: null as ChallengeEnv | null,
  solves: [] as Submission[],
});

export type ChallengeStoreType = typeof challengeStore;

export async function refreshChallenges() {
  try {
    const result = await getChallengeList(gameStore.current!.id);
    setChallengeStore({ challenges: result[0] });
  } catch (err) {
    handleHttpError(err as Error, t("challenge.errors.fetch.title")!);
  }
}

export async function refreshChallengeAssets() {
  try {
    if (challengeStore.current) {
      const files = await getChallengeAttachments(challengeStore.current.game_id, challengeStore.current.id);
      setChallengeStore({ files });
    }
  } catch (err) {
    handleHttpError(err as Error, t("challenge.file.errors.fetchFiles.title")!);
  }
  try {
    if (challengeStore.current) {
      const env = await getChallengeEnv(challengeStore.current.game_id, challengeStore.current.id);
      setChallengeStore({ env });
    }
  } catch (err) {
    handleHttpError(err as Error, t("challenge.instance.errors.fetchInstances.title")!);
  }
}

export async function refreshSolves() {
  try {
    if (!gameStore.current) return;
    setChallengeStore({ solves: await getSelfSolves(gameStore.current.id) });
  } catch (err) {
    handleHttpError(err as Error, t("challenge.submission.errors.fetchSolves.title")!);
  }
}

export async function refreshStatus() {
  try {
    if (!challengeStore.current) return;
    setChallengeStore({
      status: await getChallengeSolveStatus(challengeStore.current.game_id, challengeStore.current.id),
    });
  } catch (err) {
    setChallengeStore({ status: null });
    handleHttpError(err as Error, t("challenge.submission.errors.fetchSolveStatus.title")!);
  }
}

export async function refreshCurrentChallenge() {
  try {
    if (!gameStore.current || !challengeStore.current) return;
    const resp = await getChallenge(gameStore.current.id, challengeStore.current.id);
    setChallengeStore({ current: resp });
    refreshChallengeAssets();
  } catch (err) {
    handleHttpError(err as Error, t("challenge.errors.fetch.title")!);
  }
}

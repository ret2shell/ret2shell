import { sleep } from "@lib/utils/timeout";
import type { Challenge, ChallengeEnv, ChallengeImage } from "@models/challenge";
import type { Submission } from "@models/submission";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import type { DiagnosticMarker } from "@widgets/editor";
import type { Pod } from "kubernetes-types/core/v1";
import type { SearchParamsOption } from "ky";
import { createMemo } from "solid-js";
import type { Extra } from "../models/extra";
import type { CommitHistory } from "../models/git";
import type { Hint } from "../models/hint";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getChallengeList(game_id: number, page?: number, page_size?: number) {
  return (
    await api.get(`${api_root}/game/${game_id}/challenge`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
  ).json<[Challenge[], number]>();
}

export function useChallenges({
  game_id,
  page,
  page_size,
  enabled,
  onError,
}: {
  game_id: () => number;
  page?: () => number;
  page_size?: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", "list", page?.() ?? 1, page_size?.() ?? 200]);
  // console.log(keys());
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeList(game_id(), page?.() ?? 1, page_size?.() ?? 200),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getChallenge(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}`).json<Challenge>();
}

export function useChallenge({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id()]);

  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallenge(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createChallenge(game_id: number, challenge: Challenge) {
  return await api.post(`${api_root}/game/${game_id}/challenge`, { json: challenge }).json<Challenge>();
}

export function useCreateChallengeMutation(props: {
  onSuccess?: (challenge: Challenge) => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge: Challenge }) => createChallenge(req.game_id, req.challenge),
    onSuccess: (data: Challenge) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function updateChallenge(game_id: number, challenge: Challenge) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge.id}`, {
      json: challenge,
    })
    .json<Challenge>();
}

export function useUpdateChallengeMutation(
  props: { onSuccess?: (challenge: Challenge) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge: Challenge }) => updateChallenge(req.game_id, req.challenge),
    onSuccess: (data: Challenge) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.update.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function upChallenge(game_id: number, challenge_id: number) {
  return await api.post(`${api_root}/game/${game_id}/challenge/${challenge_id}/publish`).json<Challenge>();
}

export function useUpChallengeMutation(
  props: { onSuccess?: (challenge: Challenge) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number }) => upChallenge(req.game_id, req.challenge_id),
    onSuccess: (data: Challenge) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function downChallenge(game_id: number, challenge_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/publish`).json<Challenge>();
}

export function useDownChallengeMutation(
  props: { onSuccess?: (challenge: Challenge) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number }) => downChallenge(req.game_id, req.challenge_id),
    onSuccess: (data: Challenge) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteChallenge(game_id: number, challenge_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/challenge/${challenge_id}`).json<void>();
}

export function useDeleteChallengeMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number }) => deleteChallenge(req.game_id, req.challenge_id),
    onSuccess: () => {
      toastSuccess(t("general.actions.delete.status.success"));
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.delete.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getChallengeHint(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint`).json<Hint[]>();
}

export function useChallengeHints({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id(), "hints"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeHint(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.hint.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function unlockChallengeHint(game_id: number, challenge_id: number, hint_id: number) {
  await sleep(500);
  return await api
    .post(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint/unlock`, {
      json: {
        id: hint_id,
      },
    })
    .json<Extra>();
}

export function useUnlockChallengeHintMutation(props: {
  onSuccess?: (extra: Extra) => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number; hint_id: number }) =>
      unlockChallengeHint(req.game_id, req.challenge_id, req.hint_id),
    onSuccess: (data: Extra) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("challenge.hint.errors.unlock.title"));
      props.onError?.(err);
    },
  }));
}

export async function createChallengeHint(game_id: number, challenge_id: number, hint: Hint) {
  return await api
    .post(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint`, {
      json: hint,
    })
    .json<Hint[]>();
}

export function useCreateChallengeHintMutation(props: {
  onSuccess?: (hints: Hint[]) => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number; hint: Hint }) =>
      createChallengeHint(req.game_id, req.challenge_id, req.hint),
    onSuccess: (data: Hint[]) => {
      toastSuccess(t("general.actions.create.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteChallengeHint(game_id: number, challenge_id: number, hint_id: number) {
  return await api
    .delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint`, {
      searchParams: {
        id: hint_id,
      },
    })
    .json<void>();
}

export function useDeleteChallengeHintMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number; hint_id: number }) =>
      deleteChallengeHint(req.game_id, req.challenge_id, req.hint_id),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.delete.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getChallengeAttachments(
  game_id: number,
  challenge_id: number,
  all?: boolean,
  folder?: "static" | "mapped" | "checker"
) {
  return await api
    .get(`${api_root}/game/${game_id}/challenge/${challenge_id}/file`, {
      searchParams: JSON.parse(
        JSON.stringify({
          all,
          folder,
        })
      ) as SearchParamsOption,
    })
    .json<{ folder: "static" | "mapped" | "checker"; file: string }[]>();
}

export function useChallengeAttachments({
  game_id,
  challenge_id,
  all,
  folder,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  all?: () => boolean;
  folder?: () => "static" | "mapped" | "checker";
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => [
    "game",
    game_id(),
    "challenge",
    challenge_id(),
    "attachments",
    folder?.(),
    all?.() ? "all" : "limited",
  ]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeAttachments(game_id(), challenge_id(), all?.(), folder?.()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.file.errors.fetchFiles.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function deleteChallengeAttachment(
  game_id: number,
  challenge_id: number,
  folder: "static" | "mapped" | "checker",
  file: string
) {
  return await api
    .delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/file`, {
      searchParams: {
        folder,
        file,
      },
    })
    .json<void>();
}

export function useDeleteChallengeAttachmentMutation(props: {
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: {
      game_id: number;
      challenge_id: number;
      folder: "static" | "mapped" | "checker";
      file: string;
    }) => deleteChallengeAttachment(req.game_id, req.challenge_id, req.folder, req.file),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.delete.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getChallengeEnv(game_id: number, challenge_id: number) {
  const env = await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/env`).json<ChallengeEnv | null>();
  return normalizeChallengeEnv(env);
}

function inferProtocolByServiceType(serviceType: ChallengeImage["service_type"]) {
  switch (serviceType) {
    case "http":
      return {
        protocol: "tcp" as const,
        app_protocol: "http" as const,
      };
    case "udp":
      return {
        protocol: "udp" as const,
        app_protocol: "raw" as const,
      };
    case "tcp":
      return {
        protocol: "tcp" as const,
        app_protocol: "raw" as const,
      };
    default:
      return {
        protocol: null,
        app_protocol: null,
      };
  }
}

function normalizeChallengeImage(image: ChallengeImage): ChallengeImage {
  if (
    (image.protocol == null || image.protocol === undefined) &&
    (image.app_protocol == null || image.app_protocol === undefined)
  ) {
    const next = inferProtocolByServiceType(image.service_type);
    return {
      ...image,
      protocol: next.protocol,
      app_protocol: next.app_protocol,
    };
  }

  return {
    ...image,
    protocol: image.protocol ?? null,
    app_protocol: image.app_protocol ?? null,
  };
}

function normalizeChallengeEnv(env: ChallengeEnv | null): ChallengeEnv | null {
  if (!env) {
    return null;
  }

  return {
    ...env,
    images: env.images.map(normalizeChallengeImage),
  };
}

export function useChallengeEnv({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id(), "env"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeEnv(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.instance.errors.fetchInstances.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getChallengeInstance(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/instance`).json<Pod[]>();
}

export function useChallengeInstance({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id(), "instances"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeInstance(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.instance.errors.fetchInstances.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateChallengeEnv(game_id: number, challenge_id: number, env: ChallengeEnv) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge_id}/env`, {
      json: normalizeChallengeEnv(env),
    })
    .json<void>();
}

export function useUpdateChallengeEnvMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number; env: ChallengeEnv }) =>
      updateChallengeEnv(req.game_id, req.challenge_id, req.env),
    onSuccess: () => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteChallengeEnv(game_id: number, challenge_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/env`).json<void>();
}

export function useDeleteChallengeEnvMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number }) => deleteChallengeEnv(req.game_id, req.challenge_id),
    onSuccess: () => {
      toastSuccess(t("general.actions.delete.status.success"));
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.delete.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getChallengeCheckerScript(game_id: number, challenge_id: number, lint?: boolean) {
  return await api
    .get(`${api_root}/game/${game_id}/challenge/${challenge_id}/checker`, {
      searchParams: JSON.parse(
        JSON.stringify({
          lint,
        })
      ),
    })
    .json<{
      script: string;
      lint?: DiagnosticMarker[];
    }>();
}

export function useChallengeCheckerScript({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id(), "checkerScript"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeCheckerScript(game_id(), challenge_id(), true),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.checker.errors.fetchScript.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateChallengeCheckerScript(game_id: number, challenge_id: number, content: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge_id}/checker`, {
      json: {
        content,
      },
    })
    .json<void>();
}

export function useUpdateChallengeCheckerScriptMutation(props: {
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number; content: string }) =>
      updateChallengeCheckerScript(req.game_id, req.challenge_id, req.content),
    onSuccess: () => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getChallengeSubmission(
  game_id: number,
  challenge_id: number,
  page: number,
  page_size: number,
  only_solved: boolean
) {
  return (
    await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/submission`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
          only_solved,
        })
      ) as SearchParamsOption,
    })
  ).json<[Submission[], number]>();
}

export function useChallengeSubmissions({
  game_id,
  challenge_id,
  page,
  page_size,
  only_solved,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  page?: () => number;
  page_size?: () => number;
  only_solved?: () => boolean;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => [
    "game",
    game_id(),
    "challenge",
    challenge_id(),
    "submissions",
    only_solved?.() ? "solved" : "all",
    page?.() ?? 1,
    page_size?.() ?? 15,
  ]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () =>
        await getChallengeSubmission(game_id(), challenge_id(), page?.() ?? 1, page_size?.() ?? 15, !!only_solved?.()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.statistics.errors.fetchSubmission.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function startChallengeInstance(game_id: number, challenge_id: number) {
  await sleep(1000);
  return await api.post(`${api_root}/game/${game_id}/challenge/${challenge_id}/instance`).json<void>();
}

export function useStartChallengeInstanceMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number }) =>
      startChallengeInstance(req.game_id, req.challenge_id),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("challenge.instance.errors.start.title"));
      props.onError?.(err);
    },
  }));
}

export async function delayChallengeInstance(game_id: number, challenge_id: number) {
  await sleep(1000);
  return await api.patch(`${api_root}/game/${game_id}/challenge/${challenge_id}/instance`, {}).json<void>();
}

export function useDelayChallengeInstanceMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number }) =>
      delayChallengeInstance(req.game_id, req.challenge_id),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("challenge.instance.errors.delay.title"));
      props.onError?.(err);
    },
  }));
}

export async function stopChallengeInstance(game_id: number, challenge_id: number) {
  await sleep(1000);
  return await api.delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/instance`).json<void>();
}

export function useStopChallengeInstanceMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number }) =>
      stopChallengeInstance(req.game_id, req.challenge_id),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("challenge.instance.errors.stop.title"));
      props.onError?.(err);
    },
  }));
}

export async function getChallengeCommitHistory(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/history`).json<CommitHistory[]>();
}

export function useChallengeCommitHistory({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id(), "commitHistory"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeCommitHistory(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.statistics.errors.fetchCommitHistory"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getChallengeSolveStatus(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/submit`).json<{
    solved: boolean;
    solves: number;
  }>();
}

export function useChallengeSolveStatus({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id(), "solveStatus"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeSolveStatus(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.submission.errors.fetchSolveStatus.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getChallengeAnswer(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/answer`).json<string>();
}

export function useChallengeAnswer({
  game_id,
  challenge_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "challenge", challenge_id(), "answer"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getChallengeAnswer(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.answer.errors.fetchAnswer.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateChallengeAnswer(game_id: number, challenge_id: number, answer: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge_id}/answer`, {
      json: answer,
    })
    .json<string>();
}

export function useUpdateChallengeAnswerMutation(props: {
  onSuccess?: (answer: string) => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; challenge_id: number; answer: string }) =>
      updateChallengeAnswer(req.game_id, req.challenge_id, req.answer),
    onSuccess: (data: string) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

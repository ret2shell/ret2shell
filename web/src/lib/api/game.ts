import type { Article } from "@models/article";
import type { Audit } from "@models/audit";
import type { Chat, ChatSession } from "@models/chat";
import type { RegistryConfig } from "@models/config";
import type { Game, HostType } from "@models/game";
import type { ObjectInfo } from "@models/git";
import type { Instance } from "@models/instance";
import type { Submission } from "@models/submission";
import { type Team, TeamState } from "@models/team";
import type { User } from "@models/user";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import type { DiagnosticMarker } from "@widgets/editor";
import { HTTPError, type SearchParamsOption } from "ky";
import type { DateTime } from "luxon";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getGames(page?: number, page_size?: number, host_type?: HostType, weight?: number) {
  return (
    await api.get(`${api_root}/game`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
          host_type,
          weight,
        })
      ) as SearchParamsOption,
    })
  ).json<[Game[], number]>();
}

export function useGames({
  page,
  page_size,
  host_type,
  weight,
  enabled,
  onError,
}: {
  page?: () => number;
  page_size?: () => number;
  host_type?: () => HostType;
  weight?: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  const keys = createMemo(() => ["game", "list", host_type?.(), weight?.(), page?.(), page_size?.()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGames(page?.() ?? 1, page_size?.() ?? 15, host_type?.(), weight?.()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getGame(id: number) {
  return await api.get(`${api_root}/game/${id}`).json<Game>();
}

export function useGame({
  id,
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  id: () => number;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGame(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createGame(game: Game) {
  return await api.post(`${api_root}/game`, { json: game }).json<Game>();
}

export function useCreateGameMutation(
  props: { onSuccess?: (game: Game) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: createGame,
    onSuccess: (data: Game) => {
      toastSuccess(t("general.actions.create.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function updateGame(id: number, game: Game) {
  return await api.patch(`${api_root}/game/${id}`, { json: game }).json<Game>();
}

export function useUpdateGameMutation(
  props: { onSuccess?: (game: Game) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ id, game }: { id: number; game: Game }) => updateGame(id, game),
    onSuccess: (data: Game) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteGame(id: number) {
  return await api.delete(`${api_root}/game/${id}`).json<null>();
}

export function useDeleteGameMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => deleteGame(id),
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

export async function getGameIntroduction(id: number) {
  return await api.get(`${api_root}/game/${id}/introduction`).json<Article>();
}

export function useGameIntroduction({
  id,
  enabled,
  onError,
}: {
  id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", id(), "introduction"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameIntroduction(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        if (err instanceof HTTPError && err.response.status === 404) return onError?.(err) ?? false;
        handleHttpError(err, t("game.errors.fetchIntroduction.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateGameIntroduction(id: number, article: Article) {
  return await api.patch(`${api_root}/game/${id}/introduction`, { json: article }).json<Article>();
}

export function useUpdateGameIntroductionMutation(
  props: { onSuccess?: (article: Article) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (params: { id: number; article: Article }) => updateGameIntroduction(params.id, params.article),
    onSuccess: (data: Article) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getGameScoreboard(
  id: number,
  page?: number,
  page_size?: number,
  with_hidden?: boolean,
  institute_id?: number
) {
  return (
    await api.get(`${api_root}/game/${id}/team`, {
      searchParams: JSON.parse(
        JSON.stringify({
          min_state: with_hidden ? TeamState.Hidden : TeamState.Passed,
          page,
          page_size,
          institute_id,
          asc: false,
          order: "score",
        })
      ) as SearchParamsOption,
    })
  ).json<[Team[], number]>();
}

export function useGameScoreboard({
  id,
  page,
  page_size,
  with_hidden,
  institute_id,
  enabled,
  onError,
}: {
  id: () => number;
  page?: () => number;
  page_size?: () => number;
  with_hidden?: () => boolean;
  institute_id?: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => [
    "game",
    id(),
    "scoreboard",
    institute_id?.(),
    with_hidden?.(),
    page?.(),
    page_size?.(),
  ]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () =>
        await getGameScoreboard(id(), page?.() ?? 1, page_size?.() ?? 15, with_hidden?.(), institute_id?.()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.scoreboard.errors.fetchScoreboard.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export type EventDeviceInfo = {
  client: string;
  address: string;
  connected_at: DateTime;
};

export async function getGameDevices(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/device`).json<EventDeviceInfo[]>();
}

export function useGameDevices({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "devices"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameDevices(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.events.errors.fetchDevices.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function regenerateGameToken(game_id: number) {
  return await api
    .post(`${api_root}/game/${game_id}/token`, {
      json: {},
    })
    .json<{ token: string }>();
}

export function useRegenerateGameTokenMutation(
  props: { onSuccess?: (token: string) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => regenerateGameToken(id),
    onSuccess: (data) => props.onSuccess?.(data.token),
    onError: (err: Error) => {
      handleHttpError(err, t("game.errors.regenerateToken.title"));
      props.onError?.(err);
    },
  }));
}

export async function getGameAdmins(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/administrator`).json<User[]>();
}

export function useGameAdmins({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "admins"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameAdmins(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.administrator.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateGameAdmins(game_id: number, admins: number[]) {
  return await api.patch(`${api_root}/game/${game_id}/administrator`, { json: admins }).json<Game>();
}

export function useUpdateGameAdminsMutation(
  props: { onSuccess?: (game: Game) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (params: { game_id: number; admins: number[] }) => updateGameAdmins(params.game_id, params.admins),
    onSuccess: (data: Game) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getGameInstances(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/instance`).json<Instance[]>();
}

export function useGameInstances({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "instances"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameInstances(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        if (err instanceof HTTPError && err.response.status === 404) return onError?.(err) ?? false;
        handleHttpError(err, t("challenge.instance.errors.fetchInstances.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function submitFlag(game_id: number, challenge_id: number, flag: string) {
  return await api
    .post(`${api_root}/game/${game_id}/challenge/${challenge_id}/submit`, {
      json: {
        content: flag,
      },
    })
    .json<Submission>();
}

export function useSubmitFlagMutation(
  props: { onSuccess?: (submission: Submission) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(
    () => ({
      mutationFn: (params: { game_id: number; challenge_id: number; flag: string }) =>
        submitFlag(params.game_id, params.challenge_id, params.flag),
      onSuccess: (data: Submission) => props.onSuccess?.(data),
      onError: (err: Error) => {
        handleHttpError(err, t("challenge.submission.errors.submit.title"));
        props.onError?.(err);
      },
    }),
    () => inflyClient
  );
}

export async function checkSubmissionStatus(game_id: number, challenge_id: number, submission_id: number) {
  return await api
    .get(`${api_root}/game/${game_id}/challenge/${challenge_id}/submit`, {
      searchParams: {
        id: submission_id,
      },
    })
    .json<Submission>();
}

export async function getSelfSolves(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/solve`).json<Submission[]>();
}

export function useSelfSolves({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "selfSolves"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getSelfSolves(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.submission.errors.fetchSolves.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getGameAdminChatSessions(
  game_id: number,
  challenge_id?: number,
  page?: number,
  page_size?: number
) {
  return await api
    .get(`${api_root}/game/${game_id}/chat/admin`, {
      searchParams: JSON.parse(
        JSON.stringify({
          challenge_id,
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
    .json<[ChatSession[], number]>();
}

export function useGameAdminChatSessions({
  game_id,
  challenge_id,
  page,
  page_size,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id?: () => number;
  page?: () => number;
  page_size?: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => [
    "game",
    game_id(),
    "chat",
    "adminSessions",
    challenge_id?.(),
    page?.(),
    page_size?.(),
  ]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () =>
        await getGameAdminChatSessions(game_id(), challenge_id?.(), page?.() ?? 1, page_size?.() ?? 15),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.hammer.errors.fetchSessions.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getGameAdminChatMessages(game_id: number, challenge_id: number, team_id: number) {
  return await api
    .get(`${api_root}/game/${game_id}/chat/admin/session`, {
      searchParams: {
        challenge_id,
        team_id,
      },
    })
    .json<Chat[]>();
}

export function useGameAdminChatMessages({
  game_id,
  challenge_id,
  team_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  challenge_id: () => number;
  team_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "chat", "adminSession", challenge_id(), team_id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameAdminChatMessages(game_id(), challenge_id(), team_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.hammer.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function sendGameAdminChatMessage(
  game_id: number,
  challenge_id: number,
  team_id: number,
  content: string
) {
  return await api
    .post(`${api_root}/game/${game_id}/chat/admin/session`, {
      searchParams: {
        challenge_id,
        team_id,
      },
      json: {
        content,
      },
    })
    .json<void>();
}

export function useSendGameAdminChatMessageMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (params: { game_id: number; challenge_id: number; team_id: number; content: string }) =>
      sendGameAdminChatMessage(params.game_id, params.challenge_id, params.team_id, params.content),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("challenge.hammer.errors.send.title"));
      props.onError?.(err);
    },
  }));
}

export async function getGamePlayerChatMessages(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/chat/${challenge_id}`).json<Chat[]>();
}

export function useGamePlayerChatMessages({
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
  const keys = createMemo(() => ["game", game_id(), "chat", "playerMessages", challenge_id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGamePlayerChatMessages(game_id(), challenge_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.hammer.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function sendGamePlayerChatMessage(game_id: number, challenge_id: number, content: string) {
  return await api
    .post(`${api_root}/game/${game_id}/chat/${challenge_id}`, {
      json: {
        content,
      },
    })
    .json<void>();
}

export function useSendGamePlayerChatMessageMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (params: { game_id: number; challenge_id: number; content: string }) =>
      sendGamePlayerChatMessage(params.game_id, params.challenge_id, params.content),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("challenge.hammer.errors.send.title"));
      props.onError?.(err);
    },
  }));
}

export async function checkUnreadMessages(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/chat/unread`).json<Chat[]>();
}

export function useCheckUnreadMessages({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "chat", "unreadMessages"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await checkUnreadMessages(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.hammer.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getGameSubmissions(game_id: number, page?: number, page_size?: number) {
  return (
    await api.get(`${api_root}/game/${game_id}/submission`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
  ).json<[Submission[], number]>();
}

export function useGameSubmissions({
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
  const keys = createMemo(() => ["game", game_id(), "submissions", page?.(), page_size?.()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameSubmissions(game_id(), page?.() ?? 1, page_size?.() ?? 15),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.monitor.errors.fetchSubmission.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getGameAuditLogs(game_id: number, page?: number, page_size?: number) {
  return (
    await api.get(`${api_root}/game/${game_id}/audit`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
  ).json<[Audit[], number]>();
}

export function useGameAuditLogs({
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
  const keys = createMemo(() => ["game", game_id(), "audits", page?.(), page_size?.()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameAuditLogs(game_id(), page?.() ?? 1, page_size?.() ?? 15),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.monitor.errors.fetchAudit.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateGameAuditLog(game_id: number, audit_id: number, audit: Audit) {
  return await api
    .patch(`${api_root}/game/${game_id}/audit/${audit_id}`, {
      json: audit,
    })
    .json<Audit>();
}

export function useUpdateGameAuditLogMutation(
  props: { onSuccess?: (audit: Audit) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (params: { game_id: number; audit_id: number; audit: Audit }) =>
      updateGameAuditLog(params.game_id, params.audit_id, params.audit),
    onSuccess: (data: Audit) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export type GameStatistics = {
  total_players: number;
  institute_players: { [key: number]: number };
  total_teams: number;
  total_passed_teams: number;
  institute_teams: { [key: number]: number };
  total_submissions: number;
  total_solves: number;
  challenge_submissions: { [key: number]: number };
  challenge_solves: { [key: number]: number };
};

export async function getGameStatistics(game_id: number, training?: boolean, institute?: number) {
  return await api
    .get(`${api_root}/game/${game_id}/statistics`, {
      searchParams: JSON.parse(
        JSON.stringify({
          training,
          institute,
        })
      ),
    })
    .json<GameStatistics>();
}

export function useGameStatistics({
  game_id,
  training,
  institute,
  enabled,
  onError,
}: {
  game_id: () => number;
  training?: () => boolean | undefined;
  institute?: () => number | undefined;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "statistics", institute?.(), training?.()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameStatistics(game_id(), training?.(), institute?.()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.statistics.errors.fetch"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export type GameStatisticsExport = {
  statistics: GameStatistics;
  scoreboard: [Team, User[]][];
  audits: Audit[];
};

export async function getGameStatisticsExport(game_id: number, training?: boolean, institute?: number) {
  return await api
    .get(`${api_root}/game/${game_id}/statistics/export`, {
      searchParams: JSON.parse(
        JSON.stringify({
          training,
          institute,
        })
      ),
    })
    .json<GameStatisticsExport>();
}

export function useGameStatisticsExport({
  game_id,
  training,
  institute,
  enabled,
  onError,
}: {
  game_id: () => number;
  training?: () => boolean;
  institute?: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "statistics", "export", institute?.(), training?.()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameStatisticsExport(game_id(), training?.(), institute?.()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.statistics.errors.export"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getRegistryConfig(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/registry/config`).json<RegistryConfig>();
}

export function useRegistryConfig({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "registry", "config"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getRegistryConfig(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.instance.errors.fetchRegistry.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getRegistryRepositories(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/registry`).json<string[]>();
}

export function useRegistryRepositories({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "registry", "repositories"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getRegistryRepositories(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.instance.errors.fetchRegistry.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function refreshRegistry(game_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/registry/refresh`).json<void>();
}

export function useRefreshRegistryMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ game_id }: { game_id: number }) => refreshRegistry(game_id),
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.refresh.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getRegistryImageTags(game_id: number, repo: string) {
  return await api.get(`${api_root}/game/${game_id}/registry/${repo}`).json<string[]>();
}

export function useRegistryImageTags({
  game_id,
  repo,
  enabled,
  onError,
}: {
  game_id: () => number;
  repo: () => string;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "registry", "tags", repo()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getRegistryImageTags(game_id(), repo()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.instance.errors.fetchConfigImages.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateGameTraffic(game_id: number, traffic: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/traffic`, {
      json: {
        traffic,
      },
    })
    .json<{
      lint: DiagnosticMarker[] | null;
    }>();
}

export function useUpdateGameTrafficMutation(
  props: { onSuccess?: (result: { lint: DiagnosticMarker[] | null }) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (params: { game_id: number; traffic: string }) => updateGameTraffic(params.game_id, params.traffic),
    onSuccess: (data) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteGameTraffic(game_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/traffic`).json<void>();
}

export function useDeleteGameTrafficMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ game_id }: { game_id: number }) => deleteGameTraffic(game_id),
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

export async function updateGameNodeSelector(game_id: number, node_selector: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/node-selector`, {
      json: {
        node_selector,
      },
    })
    .json<void>();
}

export function useUpdateGameNodeSelectorMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (params: { game_id: number; node_selector: string }) =>
      updateGameNodeSelector(params.game_id, params.node_selector),
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

export async function deleteGameNodeSelector(game_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/node-selector`).json<void>();
}

export function useDeleteGameNodeSelectorMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ game_id }: { game_id: number }) => deleteGameNodeSelector(game_id),
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

export async function getGameRepo(game_id: number, path: string) {
  return await api
    .get(`${api_root}/game/${game_id}/repo`, {
      searchParams: {
        path,
      },
    })
    .json<ObjectInfo[]>();
}

export function useGameRepo({
  game_id,
  path,
  enabled,
  onError,
}: {
  game_id: () => number;
  path: () => string;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "repo", path()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameRepo(game_id(), path()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.git.errors.fetchRepo.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

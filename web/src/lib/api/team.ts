import type { Extra } from "@models/extra";
import type { Submission } from "@models/submission";
import { type Team, TeamState } from "@models/team";
import type { User } from "@models/user";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { HTTPError, type SearchParamsOption } from "ky";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getTeamInfo(game_id: number, team_id: number, ex?: boolean) {
  return await api
    .get(`${api_root}/game/${game_id}/team/${team_id}`, {
      searchParams: JSON.parse(
        JSON.stringify({
          ex,
        })
      ),
    })
    .json<Team>();
}

export function useTeamInfo({
  game_id,
  team_id,
  ex,
  enabled,
  onError,
}: {
  game_id: () => number;
  team_id: () => number;
  ex?: () => boolean;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "team", team_id(), "info", ex?.() ?? false]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: () => getTeamInfo(game_id(), team_id(), ex?.() ?? false),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("team.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getTeamRank(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/rank`).json<number>();
}

export function useTeamRank({
  game_id,
  team_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  team_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "team", team_id(), "rank"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: () => getTeamRank(game_id(), team_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateTeamInfo(game_id: number, team_id: number, team: Team) {
  return await api
    .patch(`${api_root}/game/${game_id}/team/${team_id}`, {
      json: team,
    })
    .json<Team>();
}

export function useUpdateTeamInfoMutation(
  props: { onSuccess?: (team: Team) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; team_id: number; team: Team }) =>
      updateTeamInfo(data.game_id, data.team_id, data.team),
    onSuccess: (data: Team) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteTeam(game_id: number, team_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/team/${team_id}`).json<void>();
}

export function useDeleteTeamMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; team_id: number }) => deleteTeam(data.game_id, data.team_id),
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

export async function getTeamMembers(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/member`).json<User[]>();
}

export function useTeamMembers({
  game_id,
  team_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  team_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "team", team_id(), "members"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: () => getTeamMembers(game_id(), team_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("team.errors.fetchMember.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getSelfTeam(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/self`).json<Team>();
}

export function useSelfTeam({
  silenced,
  game_id,
  enabled,
  onError,
}: {
  silenced?: boolean;
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "team", "self"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: () => getSelfTeam(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        if (!silenced && err instanceof HTTPError && err.response.status !== 404)
          handleHttpError(err, t("team.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateSelfteam(
  game_id: number,
  team: {
    name: string;
    tag: string | null;
    institute_id: number | null;
  }
) {
  return await api.patch(`${api_root}/game/${game_id}/team/self`, { json: team }).json<Team>();
}

export function useUpdateSelfTeamMutation(
  props: { onSuccess?: (team: Team) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; team: { name: string; tag: string | null; institute_id: number | null } }) =>
      updateSelfteam(data.game_id, data.team),
    onSuccess: (data: Team) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function leaveSelfTeam(game_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/team/self`).json<void>();
}

export function useLeaveSelfTeamMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ game_id }: { game_id: number }) => leaveSelfTeam(game_id),
    onSuccess: () => {
      toastSuccess(t("general.actions.leave.status.success"));
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.leave.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getTeamExtras(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/extra`).json<Extra[]>();
}

export function useTeamExtras({
  game_id,
  team_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  team_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "team", team_id(), "extras"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: () => getTeamExtras(game_id(), team_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("team.errors.fetchExtra.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createTeamExtra(game_id: number, team_id: number, extra: Extra) {
  return await api
    .post(`${api_root}/game/${game_id}/team/${team_id}/extra`, {
      json: extra,
    })
    .json<Extra>();
}

export function useCreateTeamExtraMutation(
  props: { onSuccess?: (extra: Extra) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; team_id: number; extra: Extra }) =>
      createTeamExtra(data.game_id, data.team_id, data.extra),
    onSuccess: (data: Extra) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getTeamSolves(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/solve`).json<Submission[]>();
}

export function useTeamSolves({
  game_id,
  team_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  team_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "team", team_id(), "solves"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: () => getTeamSolves(game_id(), team_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.hammer.errors.fetchSolve.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createTeam(
  game_id: number,
  team: {
    name: string;
    tag: string | null;
  }
) {
  return await api.post(`${api_root}/game/${game_id}/team`, { json: team }).json<Team>();
}

export function useCreateTeamMutation(
  props: { onSuccess?: (team: Team) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; team: { name: string; tag: string | null } }) =>
      createTeam(data.game_id, data.team),
    onSuccess: (data: Team) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function joinTeam(game_id: number, token: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/team`, {
      json: {
        token,
      },
    })
    .json<Team>();
}

export function useJoinTeamMutation(props: { onSuccess?: (team: Team) => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; token: string }) => joinTeam(data.game_id, data.token),
    onSuccess: (data: Team) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("team.errors.join.title"));
      props.onError?.(err);
    },
  }));
}

export async function getTeamList(
  game_id: number,
  page?: number,
  page_size?: number,
  order?: string,
  filter?: string,
  institute_id?: number
) {
  return await api
    .get(`${api_root}/game/${game_id}/team`, {
      searchParams: JSON.parse(
        JSON.stringify({
          min_state: TeamState.Banned,
          asc: true,
          page,
          page_size,
          order,
          filter,
          institute_id,
        })
      ) as SearchParamsOption,
    })
    .json<[Team[], number]>();
}

export function useTeamList({
  game_id,
  page,
  page_size,
  order,
  filter,
  institute_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  page?: () => number;
  page_size?: () => number;
  order?: () => string;
  filter?: () => string;
  institute_id?: () => number | null;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => [
    "game",
    game_id(),
    "teams",
    page?.() ?? 1,
    page_size?.() ?? 15,
    order?.() ?? "",
    filter?.() ?? "",
    institute_id?.() ?? undefined,
  ]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: () =>
        getTeamList(
          game_id(),
          page?.() ?? 1,
          page_size?.() ?? 15,
          order?.(),
          filter?.(),
          institute_id?.() ?? undefined
        ),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("team.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

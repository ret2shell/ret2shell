import type { Ip } from "@models/ip";
import type { OAuth } from "@models/oauth";
import type { Team } from "@models/team";
import type { User } from "@models/user";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import type { SearchParamsOption } from "ky";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getUserList(
  page?: number,
  page_size?: number,
  order?: string,
  filter?: string,
  institute_id?: number
) {
  return await api
    .get(`${api_root}/user`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
          order,
          filter,
          institute_id,
        })
      ) as SearchParamsOption,
    })
    .json<[User[], number]>();
}

export function useUsers({
  page,
  page_size,
  order,
  filter,
  institute_id,
  enabled,
  onError,
}: {
  page: () => number;
  page_size: () => number;
  order?: () => string;
  filter?: () => string | null;
  institute_id?: () => number | null;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["user", "list", page(), page_size(), order?.(), filter?.(), institute_id?.()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () =>
        await getUserList(
          page() ?? 1,
          page_size() ?? 15,
          order?.(),
          filter?.() ?? undefined,
          institute_id?.() ?? undefined
        ),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("user.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getUser(id: number) {
  return await api.get(`${api_root}/user/${id}`).json<User>();
}

export function useUser({
  id,
  enabled,
  onError,
}: {
  id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["user", id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getUser(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("user.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getUserTeams(id: number) {
  return await api.get(`${api_root}/user/${id}/team`).json<Team[]>();
}

export function useUserTeams({
  id,
  enabled,
  onError,
}: {
  id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["user", id(), "teams"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getUserTeams(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("team.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateUser(user: User) {
  return await api.patch(`${api_root}/user/${user.id}`, { json: user }).json<User>();
}

export function useUpdateUserMutation(
  props: { onSuccess?: (user: User) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (user: User) => updateUser(user),
    onSuccess: (data: User) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteUser(id: number) {
  return await api.delete(`${api_root}/user/${id}`).json();
}

export function useDeleteUserMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => deleteUser(id),
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

export async function getUserIpList(id: number) {
  return await api.get(`${api_root}/user/${id}/ip`).json<Ip[]>();
}

export function useUserIpList({
  id,
  enabled,
  onError,
}: {
  id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["user", id(), "ips"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getUserIpList(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("user.errors.fetchIpList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getUserOAuthList(id: number) {
  return await api.get(`${api_root}/user/${id}/oauth`).json<OAuth[]>();
}

export function useUserOAuthList({
  id,
  enabled,
  onError,
}: {
  id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["user", id(), "oauths"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getUserOAuthList(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("user.errors.fetchOAuth.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

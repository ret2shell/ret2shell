import type { Article } from "@models/article";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import type { SearchParamsOption } from "ky";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getBulletinList(page: number, page_size: number) {
  return await api
    .get(`${api_root}/bulletin`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
    .json<[Article[], number]>();
}

export function useBulletins({
  page,
  page_size,
  onError,
  enabled,
}: {
  page: () => number;
  page_size: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["bulletin", "list", page(), page_size()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getBulletinList(page() ?? 1, page_size() ?? 15),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("bulletin.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getBulletin(id: number) {
  return await api.get(`${api_root}/bulletin/${id}`).json<Article>();
}

export function useBulletin({
  id,
  enabled,
  onError,
}: {
  id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["bulletin", id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getBulletin(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("bulletin.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createBulletin(article: Article) {
  return await api.post(`${api_root}/bulletin`, { json: article }).json<Article>();
}

export function useCreateBulletinMutation(
  props: { onSuccess?: (article: Article) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (article: Article) => createBulletin(article),
    onSuccess: (data: Article) => {
      toastSuccess(t("general.actions.create.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function updateBulletin(article: Article) {
  return await api.patch(`${api_root}/bulletin/${article.id}`, { json: article }).json<Article>();
}

export function useUpdateBulletinMutation(
  props: { onSuccess?: (article: Article) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (article: Article) => updateBulletin(article),
    onSuccess: (data: Article) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteBulletin(id: number) {
  return await api.delete(`${api_root}/bulletin/${id}`).json();
}

export function useDeleteBulletinMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => deleteBulletin(id),
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

import type { Article } from "@models/article";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getWikiTree() {
  return await api.get(`${api_root}/wiki`).json<Article[]>();
}

export function useWikiTree({ enabled, onError }: { enabled?: () => boolean; onError?: (err: Error) => boolean }) {
  return useQuery(
    () => ({
      queryKey: ["wiki", "tree"],
      queryFn: getWikiTree,
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("wiki.errors.fetchToc.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getWiki(id: number) {
  return await api.get(`${api_root}/wiki/${id}`).json<Article>();
}

export function useWiki({
  id,
  enabled,
  onError,
}: {
  id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["wiki", id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getWiki(id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("wiki.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createWiki(article: Article) {
  return await api.post(`${api_root}/wiki`, { json: article }).json<Article>();
}

export function useCreateWikiMutation(
  props: { onSuccess?: (article: Article) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (article: Article) => createWiki(article),
    onSuccess: (data: Article) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function updateWiki(article: Article) {
  return await api.patch(`${api_root}/wiki/${article.id}`, { json: article }).json<Article>();
}

export function useUpdateWikiMutation(
  props: { onSuccess?: (article: Article) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (article: Article) => updateWiki(article),
    onSuccess: (data: Article) => {
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteWiki(id: number) {
  return await api.delete(`${api_root}/wiki/${id}`).json();
}

export function useDeleteWikiMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => deleteWiki(id),
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

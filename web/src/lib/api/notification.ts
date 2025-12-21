import type { Notification } from "@models/notification";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getNotifications(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/notification`).json<Notification[]>();
}

export function useNotifications({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "notifications"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getNotifications(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.notification.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createNotification(game_id: number, notification: Notification) {
  return await api.post(`${api_root}/game/${game_id}/notification`, { json: notification }).json<Notification>();
}

export function useCreateNotificationMutation(
  props: { onSuccess?: (notification: Notification) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; notification: Notification }) =>
      createNotification(data.game_id, data.notification),
    onSuccess: (data: Notification) => {
      toastSuccess(t("general.actions.create.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteNotification(game_id: number, id: number) {
  return await api.delete(`${api_root}/game/${game_id}/notification/${id}`).json<null>();
}

export function useDeleteNotificationMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: (data: { game_id: number; id: number }) => deleteNotification(data.game_id, data.id),
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

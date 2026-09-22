import type { Milestone } from "@models/milestone";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, safeJson, toastSuccess } from ".";

export async function getMilestones(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/milestone`).json<Milestone[]>();
}

export function useMilestones({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "milestone", "list"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getMilestones(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("challenge.milestone.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createMilestone(game_id: number, milestone: Milestone) {
  return await api.post(`${api_root}/game/${game_id}/milestone`, { json: milestone }).json<Milestone>();
}

export function useCreateMilestoneMutation(props: {
  silenced?: boolean;
  onSuccess?: (milestone: Milestone) => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; milestone: Milestone }) => createMilestone(req.game_id, req.milestone),
    onSuccess: (data: Milestone) => {
      if (!props.silenced) {
        toastSuccess(t("general.actions.create.status.success"));
        inflyClient.invalidateQueries({ queryKey: ["game", data.game_id, "milestone"] });
      }
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      if (!props.silenced) {
        handleHttpError(err, t("general.actions.create.status.fail"));
      }
      props.onError?.(err);
    },
  }));
}

export async function updateMilestone(game_id: number, milestone: Milestone) {
  return await api
    .patch(`${api_root}/game/${game_id}/milestone/${milestone.id}`, { json: milestone })
    .json<Milestone>();
}

export function useUpdateMilestoneMutation(
  props: { silenced?: boolean; onSuccess?: (milestone: Milestone) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; milestone: Milestone }) => updateMilestone(req.game_id, req.milestone),
    onSuccess: (data: Milestone) => {
      if (!props.silenced) {
        toastSuccess(t("general.actions.save.status.success"));
        inflyClient.invalidateQueries({ queryKey: ["game", data.game_id, "milestone"] });
      }
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      if (!props.silenced) {
        handleHttpError(err, t("general.actions.update.status.fail"));
      }
      props.onError?.(err);
    },
  }));
}

export async function deleteMilestone(game_id: number, milestone_id: number) {
  return await safeJson(api.delete(`${api_root}/game/${game_id}/milestone/${milestone_id}`).json<void>());
}

export function useDeleteMilestoneMutation(props: {
  silenced?: boolean;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}) {
  return useMutation(() => ({
    mutationFn: (req: { game_id: number; milestone_id: number }) => deleteMilestone(req.game_id, req.milestone_id),
    onSuccess: (_data, variables) => {
      if (!props.silenced) {
        toastSuccess(t("general.actions.delete.status.success"));
        inflyClient.invalidateQueries({ queryKey: ["game", variables.game_id, "milestone"] });
      }
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      if (!props.silenced) {
        handleHttpError(err, t("general.actions.delete.status.fail"));
      }
      props.onError?.(err);
    },
  }));
}

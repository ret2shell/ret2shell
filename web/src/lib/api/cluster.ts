import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import type { DiagnosticMarker } from "@widgets/editor";
import type { ConfigMapList, NodeList } from "kubernetes-types/core/v1";
import { DateTime } from "luxon";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export async function getClusterConfig() {
  return await api.get(`${api_root}/cluster/config`).json<ConfigMapList>();
}

export function useClusterConfig({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["cluster", "config"],
      queryFn: async () => await getClusterConfig(),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("cluster.errors.fetchConfig.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getClusterNodes() {
  return await api.get(`${api_root}/cluster/node`).json<NodeList>();
}

export function useClusterNodes({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["cluster", "nodes"],
      queryFn: async () => await getClusterNodes(),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("cluster.errors.fetchNodes.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getCalmdownStatus() {
  const result = await api.get(`${api_root}/cluster/calmdown`).json<number | null>();
  if (result) {
    return DateTime.fromSeconds(result);
  }
  return null;
}

export function useCalmdownStatus({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["cluster", "calmdown"],
      queryFn: async () => await getCalmdownStatus(),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateGlobalTrafficScript(traffic: string) {
  return await api.patch(`${api_root}/cluster/traffic`, { json: { traffic } }).json<{
    lint: DiagnosticMarker[] | null;
  }>();
}

export function useUpdateGlobalTrafficScriptMutation(
  props: { onSuccess?: (resp: { lint: DiagnosticMarker[] | null }) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ traffic }: { traffic: string }) => updateGlobalTrafficScript(traffic),
    onSuccess: (resp) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(resp);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteGlobalTrafficScript() {
  return await api.delete(`${api_root}/cluster/traffic`).json<void>();
}

export function useDeleteGlobalTrafficScriptMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: deleteGlobalTrafficScript,
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

export async function updateDefaultNodeSelector(node_selector: string) {
  return await api.patch(`${api_root}/cluster/node-selector`, { json: { node_selector } }).json<void>();
}

export function useUpdateDefaultNodeSelectorMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ node_selector }: { node_selector: string }) => updateDefaultNodeSelector(node_selector),
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

export async function deleteDefaultNodeSelector() {
  return await api.delete(`${api_root}/cluster/node-selector`).json<void>();
}

export function useDeleteDefaultNodeSelectorMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: deleteDefaultNodeSelector,
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

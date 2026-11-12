import type { SyncJob, SyncJobStatus, SyncSource, SyncSourceLastStatus } from "@models/sync";
import { isRunningStatus } from "@models/sync";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export type SyncSourceRequest = {
  repository_url: string;
  // write-only: only sent when the admin provides one, never echoed back
  token?: string;
  local_game_id: number;
  // null means the source only syncs manually
  interval_seconds: number | null;
  enabled: boolean;
};

export type SyncSourceUpdateRequest = {
  // omitted token keeps the stored one
  token?: string;
  interval_seconds?: number | null;
  enabled?: boolean;
};

export async function getSyncSources() {
  return await api.get(`${api_root}/platform/sync/sources`).json<SyncSource[]>();
}

export function useSyncSources({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "sync", "sources"],
      queryFn: getSyncSources,
      enabled: enabled?.(),
      // deliberately no persister: sync metadata must not land in localStorage
      refetchInterval: (query: { state: { data?: SyncSource[] } }): number | false =>
        query.state.data?.some((source) => isRunningStatus(source.last_status)) ? 3000 : false,
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.errors.fetchSources.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createSyncSource(req: SyncSourceRequest) {
  return await api.post(`${api_root}/platform/sync/sources`, { json: req }).json<SyncSource>();
}

export function useCreateSyncSourceMutation(
  props: { onSuccess?: (source: SyncSource) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (req: SyncSourceRequest) => createSyncSource(req),
    onSuccess: (source: SyncSource) => {
      toastSuccess(t("platform.sync.actions.create.status.success"));
      props.onSuccess?.(source);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function updateSyncSource(id: number, req: SyncSourceUpdateRequest) {
  return await api.patch(`${api_root}/platform/sync/sources/${id}`, { json: req }).json<SyncSource>();
}

export function useUpdateSyncSourceMutation(
  props: { onSuccess?: (source: SyncSource) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ id, req }: { id: number; req: SyncSourceUpdateRequest }) => updateSyncSource(id, req),
    onSuccess: (source: SyncSource) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(source);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteSyncSource(id: number) {
  return await api.delete(`${api_root}/platform/sync/sources/${id}`).json<void>();
}

export function useDeleteSyncSourceMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: (id: number) => deleteSyncSource(id),
    onSuccess: () => {
      toastSuccess(t("platform.sync.actions.unbind.status.success"));
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.actions.unbind.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function triggerSyncJob(id: number) {
  return await api.post(`${api_root}/platform/sync/sources/${id}/jobs`).json<Pick<SyncJob, "id">>();
}

export function useTriggerSyncJobMutation(
  props: { onSuccess?: (jobId: number) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (id: number) => triggerSyncJob(id),
    onSuccess: ({ id }: { id: number }) => {
      toastSuccess(t("platform.sync.actions.sync.status.success"));
      props.onSuccess?.(id);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.actions.sync.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getSyncJobs(id: number) {
  return await api.get(`${api_root}/platform/sync/sources/${id}/jobs`).json<SyncJob[]>();
}

export function useSyncJobs({
  sourceId,
  enabled,
  onError,
}: {
  sourceId: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "sync", "sources", sourceId(), "jobs"] as const,
      queryFn: () => getSyncJobs(sourceId()),
      enabled: enabled?.() && sourceId() > 0,
      // poll the job list every 3 seconds while a job is queued or running
      refetchInterval: (query: { state: { data?: SyncJob[] } }): number | false =>
        query.state.data?.some((job) => isRunningStatus(job.status)) ? 3000 : false,
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.errors.fetchJobs.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getSyncJob(id: number) {
  return await api.get(`${api_root}/platform/sync/jobs/${id}`).json<SyncJob>();
}

export function useSyncJob({
  jobId,
  enabled,
  onError,
}: {
  jobId: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "sync", "jobs", jobId()] as const,
      queryFn: () => getSyncJob(jobId()),
      enabled: enabled?.() && jobId() > 0,
      refetchInterval: (query: { state: { data?: SyncJob } }): number | false =>
        isRunningStatus(query.state.data?.status) ? 3000 : false,
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.errors.fetchJob.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

/**
 * One-shot import. The endpoint answers with a streamed plain-text sync log,
 * so the body is consumed incrementally: every chunk is forwarded to
 * `onLog` for live display and the accumulated text is returned once the
 * stream finishes. The request body carries the credential; it never appears
 * in the URL.
 */
export async function importRepository(
  req: { repository_url: string; token: string },
  onLog?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<{ log: string; gameId?: number }> {
  const response = await api.post(`${api_root}/platform/sync/import`, {
    json: req,
    signal,
  });
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let log = "";
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      log += chunk;
      onLog?.(chunk);
    }
  }
  return { log, gameId: parseImportedGameId(log) };
}

/**
 * Extracts the local game created by an import from the streamed log. Both
 * the sentinel line used by the plain-text stream and the `completed` NDJSON
 * event defined by the API contract are accepted.
 */
export function parseImportedGameId(log: string): number | undefined {
  const sentinel = log.match(/SYNC_IMPORT_GAME_ID=(\d+)/);
  if (sentinel) {
    return Number.parseInt(sentinel[1], 10);
  }
  for (const line of log.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      const event = JSON.parse(line) as { type?: string; game_id?: unknown };
      if (event.type === "completed" && typeof event.game_id === "number") {
        return event.game_id;
      }
    } catch {
      // not an NDJSON line, keep scanning
    }
  }
  return undefined;
}

export type { SyncJobStatus, SyncSourceLastStatus };

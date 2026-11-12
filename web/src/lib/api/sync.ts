import type {
  RegistryIndexEntry,
  SyncDistribution,
  SyncDistributionLastStatus,
  SyncJob,
  SyncJobStatus,
} from "@models/sync";
import { isRunningStatus } from "@models/sync";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export type SyncDistributionUpdateRequest = {
  // omitted token keeps the stored one
  token?: string;
  interval_seconds?: number | null;
  enabled?: boolean;
};

export async function getSyncDistributions() {
  return await api.get(`${api_root}/platform/sync/distributions`).json<SyncDistribution[]>();
}

export function useSyncDistributions({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "sync", "distributions"],
      queryFn: getSyncDistributions,
      enabled: enabled?.(),
      // deliberately no persister: sync metadata must not land in localStorage
      refetchInterval: (query: { state: { data?: SyncDistribution[] } }): number | false =>
        query.state.data?.some((distribution) =>
          isRunningStatus(distribution.last_status as SyncDistributionLastStatus)
        )
          ? 3000
          : false,
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.errors.fetchDistributions.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateSyncDistribution(id: number, req: SyncDistributionUpdateRequest) {
  return await api.patch(`${api_root}/platform/sync/distributions/${id}`, { json: req }).json<SyncDistribution>();
}

export function useUpdateSyncDistributionMutation(
  props: { onSuccess?: (distribution: SyncDistribution) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ id, req }: { id: number; req: SyncDistributionUpdateRequest }) => updateSyncDistribution(id, req),
    onSuccess: (distribution: SyncDistribution) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(distribution);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function unbindSyncDistribution(id: number) {
  return await api.post(`${api_root}/platform/sync/distributions/${id}/unbind`).json<SyncDistribution>();
}

export function useUnbindSyncDistributionMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (id: number) => unbindSyncDistribution(id),
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

export async function deleteSyncDistribution(id: number) {
  return await api.delete(`${api_root}/platform/sync/distributions/${id}`).json<void>();
}

export function useDeleteSyncDistributionMutation(
  props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (id: number) => deleteSyncDistribution(id),
    onSuccess: () => {
      toastSuccess(t("platform.sync.actions.delete.status.success"));
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.actions.delete.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function bindSyncDistribution(id: number, localGameId: number) {
  return await api
    .post(`${api_root}/platform/sync/distributions/${id}/bind`, {
      json: { local_game_id: localGameId },
    })
    .json<SyncDistribution>();
}

export async function triggerSyncJob(id: number) {
  return await api.post(`${api_root}/platform/sync/distributions/${id}/jobs`).json<Pick<SyncJob, "id">>();
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
  return await api.get(`${api_root}/platform/sync/distributions/${id}/jobs`).json<SyncJob[]>();
}

export function useSyncJobs({
  distributionId,
  enabled,
  onError,
}: {
  distributionId: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "sync", "distributions", distributionId(), "jobs"] as const,
      queryFn: () => getSyncJobs(distributionId()),
      enabled: enabled?.() && distributionId() > 0,
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
 * One-shot import against the streamed log endpoint. Both import modes share
 * this reader: every chunk is forwarded to `onLog` for live display and the
 * accumulated text is returned once the stream finishes.
 */
async function streamImport(
  request: Record<string, string>,
  onLog?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<{ log: string; gameId?: number }> {
  const response = await api.post(`${api_root}/platform/sync/import`, {
    json: request,
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
 * Direct import: the admin-chosen source endpoint plus its credential. The
 * credential travels in the request body only; it never appears in the URL.
 */
export async function importRepository(
  req: { endpoint: string; token: string },
  onLog?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<{ log: string; gameId?: number }> {
  return await streamImport({ endpoint: req.endpoint, token: req.token }, onLog, signal);
}

/**
 * Community import: only the registry index URL and the entry's bucket id.
 * The backend re-reads the entry server-side for its credential and the
 * admission head, so no token ever reaches the browser.
 */
export async function importFromRegistry(
  req: { registry_url: string; bucket_id: string },
  onLog?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<{ log: string; gameId?: number }> {
  return await streamImport({ registry_url: req.registry_url, bucket_id: req.bucket_id }, onLog, signal);
}

/**
 * Fetches the sanitized listing of a community registry index. The backend
 * proxies the index and strips entry tokens.
 */
export async function fetchRegistryIndex(url: string) {
  return await api.post(`${api_root}/platform/sync/registry/index`, { json: { url } }).json<RegistryIndexEntry[]>();
}

export function useRegistryIndexMutation(
  props: { onSuccess?: (entries: RegistryIndexEntry[]) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (url: string) => fetchRegistryIndex(url),
    onSuccess: (entries: RegistryIndexEntry[]) => props.onSuccess?.(entries),
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.errors.fetchRegistry.title"));
      props.onError?.(err);
    },
  }));
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

export type { SyncDistributionLastStatus, SyncJobStatus };

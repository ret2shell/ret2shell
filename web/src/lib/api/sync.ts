import type {
  CatalogGame,
  CatalogRelease,
  CatalogReleaseDetail,
  DirectDiscoverResponse,
  GameReleaseSummary,
  GameSyncStatus,
  RegistryPublicationMetadata,
  RegistryUpstreamMetadata,
  SyncJob,
  SyncJobDetail,
  SyncRegistrySource,
} from "@models/sync";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, toastSuccess } from ".";

export type SyncRegistrySourcePayload = {
  name: string;
  git_url: string;
  branch: string;
  enabled: boolean;
  priority: number;
};

export type DirectDiscoverPayload = {
  base_url: string;
  sync_token?: string | null;
  game_key?: string | null;
  release_id?: string | null;
};

export type DirectImportPayload = {
  base_url: string;
  sync_token?: string | null;
  game_key: string;
  release_id: string;
};

export type CatalogImportPayload = {
  source_id: number;
  game_key: string;
  release_id: string;
  upstream_instance_id: string;
};

export async function getSyncSources() {
  return await api.get(`${api_root}/sync/source`).json<SyncRegistrySource[]>();
}

export async function getCatalogGames(source_id: number) {
  return await api.get(`${api_root}/sync/catalog/games`, { searchParams: { source_id } }).json<CatalogGame[]>();
}

export function useCatalogGames({
  source_id,
  enabled,
  onError,
}: {
  source_id: () => number | null;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["sync", "catalog", "games", source_id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getCatalogGames(source_id()!),
      enabled: enabled?.() && source_id() != null,
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.catalog.errors.fetchGames.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getCatalogReleases(source_id: number, game_key: string) {
  return await api
    .get(`${api_root}/sync/catalog/games/${game_key}`, { searchParams: { source_id } })
    .json<CatalogRelease[]>();
}

export function useCatalogReleases({
  source_id,
  game_key,
  enabled,
  onError,
}: {
  source_id: () => number | null;
  game_key: () => string | null;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["sync", "catalog", "releases", source_id(), game_key()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getCatalogReleases(source_id()!, game_key()!),
      enabled: enabled?.() && source_id() != null && !!game_key(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.catalog.errors.fetchReleases.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getCatalogReleaseDetail(source_id: number, game_key: string, release_id: string) {
  return await api
    .get(`${api_root}/sync/catalog/games/${game_key}/releases/${release_id}`, { searchParams: { source_id } })
    .json<CatalogReleaseDetail>();
}

export function useCatalogReleaseDetail({
  source_id,
  game_key,
  release_id,
  enabled,
  onError,
}: {
  source_id: () => number | null;
  game_key: () => string | null;
  release_id: () => string | null;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["sync", "catalog", "release", source_id(), game_key(), release_id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getCatalogReleaseDetail(source_id()!, game_key()!, release_id()!),
      enabled: enabled?.() && source_id() != null && !!game_key() && !!release_id(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.catalog.errors.fetchDetail.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export function useSyncSources(props: { enabled?: () => boolean; onError?: (err: Error) => boolean } = {}) {
  const keys = createMemo(() => ["sync", "source"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: getSyncSources,
      enabled: props.enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.sources.errors.fetch.title"));
        return props.onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function createSyncSource(source: SyncRegistrySourcePayload) {
  return await api.post(`${api_root}/sync/source`, { json: source }).json<SyncRegistrySource>();
}

export function useCreateSyncSourceMutation(
  props: { onSuccess?: (source: SyncRegistrySource) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: createSyncSource,
    onSuccess: (data) => {
      toastSuccess(t("general.actions.create.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function updateSyncSource(id: number, source: SyncRegistrySourcePayload) {
  return await api.patch(`${api_root}/sync/source/${id}`, { json: source }).json<SyncRegistrySource>();
}

export function useUpdateSyncSourceMutation(
  props: { onSuccess?: (source: SyncRegistrySource) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ id, source }: { id: number; source: SyncRegistrySourcePayload }) => updateSyncSource(id, source),
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

export async function deleteSyncSource(id: number) {
  return await api.delete(`${api_root}/sync/source/${id}`).json<null>();
}

export function useDeleteSyncSourceMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => deleteSyncSource(id),
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

export async function fetchSyncSource(id: number) {
  return await api.post(`${api_root}/sync/source/${id}/fetch`, { json: {} }).json<SyncRegistrySource>();
}

export function useFetchSyncSourceMutation(
  props: { onSuccess?: (source: SyncRegistrySource) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => fetchSyncSource(id),
    onSuccess: (data) => {
      toastSuccess(t("platform.sync.sources.actions.fetch.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.sources.actions.fetch.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getGameSyncReleases(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/sync/releases`).json<GameReleaseSummary[]>();
}

export function useGameSyncReleases({
  game_id,
  enabled,
  onError,
}: {
  game_id: () => number;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["game", game_id(), "sync-release"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getGameSyncReleases(game_id()),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("game.sync.errors.fetchReleases.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function rotateGameSyncToken(game_id: number) {
  return await api.post(`${api_root}/game/${game_id}/sync/sync-token`, { json: {} }).json<{ sync_token: string }>();
}

export async function detachGameSync(game_id: number, reason?: string) {
  return await api
    .post(`${api_root}/game/${game_id}/sync/detach`, { json: { reason: reason || null } })
    .json<GameSyncStatus>();
}

export function useRotateGameSyncTokenMutation(
  props: { onSuccess?: (syncToken: string) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ game_id }: { game_id: number }) => rotateGameSyncToken(game_id),
    onSuccess: (data) => {
      toastSuccess(t("general.actions.refresh.status.success"));
      props.onSuccess?.(data.sync_token);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("game.sync.actions.rotateToken.fail"));
      props.onError?.(err);
    },
  }));
}

export function useDetachGameSyncMutation(
  props: { onSuccess?: (status: GameSyncStatus) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ game_id, reason }: { game_id: number; reason?: string }) => detachGameSync(game_id, reason),
    onSuccess: (data) => {
      toastSuccess(t("game.sync.actions.detach.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("game.sync.actions.detach.fail"));
      props.onError?.(err);
    },
  }));
}

export async function publishGameSyncRelease(game_id: number) {
  return await api.post(`${api_root}/game/${game_id}/sync/publish`, { json: {} }).json<RegistryPublicationMetadata>();
}

export async function advertiseGameSyncUpstream(game_id: number) {
  return await api.post(`${api_root}/game/${game_id}/sync/advertise`, { json: {} }).json<RegistryUpstreamMetadata>();
}

export function usePublishGameSyncMutation(
  props: { onSuccess?: (publication: RegistryPublicationMetadata) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ game_id }: { game_id: number }) => publishGameSyncRelease(game_id),
    onSuccess: (data) => {
      toastSuccess(t("game.sync.actions.publish.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("game.sync.actions.publish.fail"));
      props.onError?.(err);
    },
  }));
}

export function useAdvertiseGameSyncMutation(
  props: { onSuccess?: (publication: RegistryUpstreamMetadata) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ game_id }: { game_id: number }) => advertiseGameSyncUpstream(game_id),
    onSuccess: (data) => {
      toastSuccess(t("game.sync.actions.advertise.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("game.sync.actions.advertise.fail"));
      props.onError?.(err);
    },
  }));
}

export async function discoverDirectSyncSource(payload: DirectDiscoverPayload) {
  return await api.post(`${api_root}/sync/direct/discover`, { json: payload }).json<DirectDiscoverResponse>();
}

export function useDiscoverDirectSyncMutation(
  props: { onSuccess?: (response: DirectDiscoverResponse) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: discoverDirectSyncSource,
    onSuccess: (data) => props.onSuccess?.(data),
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.direct.fail"));
      props.onError?.(err);
    },
  }));
}

export async function importDirectSyncRelease(payload: DirectImportPayload) {
  return await api.post(`${api_root}/sync/direct/import`, { json: payload }).json<SyncJob>();
}

export async function importCatalogSyncRelease(payload: CatalogImportPayload) {
  return await api.post(`${api_root}/sync/catalog/import`, { json: payload }).json<SyncJob>();
}

export function useImportDirectSyncMutation(
  props: { onSuccess?: (response: SyncJob) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: importDirectSyncRelease,
    onSuccess: (data) => {
      toastSuccess(t("platform.sync.direct.import.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.direct.import.fail"));
      props.onError?.(err);
    },
  }));
}

export function useImportCatalogSyncMutation(
  props: { onSuccess?: (response: SyncJob) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: importCatalogSyncRelease,
    onSuccess: (data) => {
      toastSuccess(t("platform.sync.catalog.import.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.catalog.import.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getSyncJobs() {
  return await api.get(`${api_root}/sync/direct/job`).json<SyncJob[]>();
}

export function useSyncJobs(props: { enabled?: () => boolean; onError?: (err: Error) => boolean } = {}) {
  const keys = createMemo(() => ["sync", "job"]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: getSyncJobs,
      enabled: props.enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.jobs.errors.fetch.title"));
        return props.onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getSyncJob(job_id: number) {
  return await api.get(`${api_root}/sync/direct/job/${job_id}`).json<SyncJobDetail>();
}

export function useSyncJob({
  job_id,
  enabled,
  onError,
}: {
  job_id: () => number | null;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => ["sync", "job", job_id()]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getSyncJob(job_id()!),
      enabled: enabled?.() && job_id() != null,
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.sync.jobs.errors.fetchDetail.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function resumeSyncJob(job_id: number) {
  return await api.post(`${api_root}/sync/direct/job/${job_id}/resume`, { json: {} }).json<SyncJob>();
}

export function useResumeSyncJobMutation(
  props: { onSuccess?: (job: SyncJob) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ job_id }: { job_id: number }) => resumeSyncJob(job_id),
    onSuccess: (data) => {
      toastSuccess(t("platform.sync.jobs.actions.resume.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.jobs.actions.resume.fail"));
      props.onError?.(err);
    },
  }));
}

export async function cancelSyncJob(job_id: number) {
  return await api.post(`${api_root}/sync/direct/job/${job_id}/cancel`, { json: {} }).json<SyncJob>();
}

export function useCancelSyncJobMutation(
  props: { onSuccess?: (job: SyncJob) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: ({ job_id }: { job_id: number }) => cancelSyncJob(job_id),
    onSuccess: (data) => {
      toastSuccess(t("platform.sync.jobs.actions.cancel.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("platform.sync.jobs.actions.cancel.fail"));
      props.onError?.(err);
    },
  }));
}

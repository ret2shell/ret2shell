import type { AuthConfig, Config, ServerConfig } from "@models/config";
import type { HostType } from "@models/game";
import type { Institute } from "@models/institute";
import { luxonReplacer } from "@models/utils";
import { t } from "@storage/theme";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { DateTime } from "luxon";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient, persister, toastSuccess } from ".";

export async function getPlatformInfo() {
  return await api.get(`${api_root}/platform/info`).json<ServerConfig>();
}

export function usePlatformInfo({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "info"],
      queryFn: getPlatformInfo,
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        return onError?.(err) ?? false;
      },
      // biome-ignore lint/suspicious/noExplicitAny: this function is matched
      persister: persister.persisterFn as any,
    }),
    () => inflyClient
  );
}

export async function getAuthConfig() {
  return await api.get(`${api_root}/platform/auth`).json<AuthConfig>();
}

export async function getVersion() {
  return await api.get(`${api_root}/platform/version`).json<string>();
}

export function useVersion({ enabled, onError }: { enabled?: () => boolean; onError?: (err: Error) => boolean }) {
  return useQuery(
    () => ({
      queryKey: ["platform", "version"],
      queryFn: getVersion,
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export type PlatformStatistics = {
  users: {
    total: number;
    valid: number;
    institutes: [number, number][];
    ips: number;
  };
  institutes: Institute[];
  games: {
    id: number;
    name: string;
    start_at: DateTime;
    end_at: DateTime;
    register_at: DateTime;
    archive_at: DateTime;
    host_type: HostType;
    teams: number;
  }[];
  submissions: {
    total: number;
    solved: number;
  };
  challenges: {
    total: number;
    training: number;
  };
};

export async function getPlatformStatistics() {
  return await api.get(`${api_root}/platform/statistics`).json<PlatformStatistics>();
}

export function usePlatformStatistics({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "statistics"],
      queryFn: getPlatformStatistics,
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.statistics.errors.fetch.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getPlatformLogs() {
  return await api.get(`${api_root}/platform/logs`).json<string[]>();
}

export function usePlatformLogs({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "logs"],
      queryFn: async () => (await getPlatformLogs()).sort((a, b) => b.localeCompare(a)),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.logs.errors.fetchList.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export type Log = {
  _time: string;
  _msg: string;
  level: string;
  target: string;
  [key: string]: string;
};

export async function queryPlatformLog(req: {
  started_at: DateTime;
  ended_at: DateTime;
  limit?: number;
  level?: string;
  trace?: string;
  from?: string;
  account?: string;
  query?: string;
}) {
  const result = await api
    .get(`${api_root}/platform/logs/query`, {
      searchParams: {
        ...JSON.parse(JSON.stringify(req, luxonReplacer)),
      },
    })
    .text();
  const logs = result.split("\n").filter((line) => line.trim() !== "");
  return logs.map((line) => JSON.parse(line) as Log);
}

export function useQueryPlatformLog({
  req,
  enabled,
  onError,
}: {
  req: () => {
    started_at: DateTime;
    ended_at: DateTime;
    limit?: number;
    level?: string;
    trace?: string;
    from?: string;
    account?: string;
    query?: string;
  };
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() => [
    "platform",
    "logs",
    req().started_at.toISO(),
    req().ended_at.toISO(),
    req().limit,
    req().level,
    req().trace,
    req().from,
    req().account,
    req().query,
  ]);
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () =>
        (await queryPlatformLog(req())).sort((a, b) => {
          return DateTime.fromISO(a._time).toMillis() - DateTime.fromISO(b._time).toMillis();
        }),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.logs.errors.fetchLogs.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export type PlatformLicense = {
  issuer: string;
  website: string;
  date: string;
  level: string;
};

export async function getPlatformLicense() {
  return await api.get(`${api_root}/platform/license`).json<PlatformLicense>();
}

export function usePlatformLicense({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "license"],
      queryFn: async () => await getPlatformLicense(),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getPlatformConfig() {
  return await api.get(`${api_root}/platform/config`).json<Config>();
}

export function usePlatformConfig({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["platform", "config"],
      queryFn: async () => await getPlatformConfig(),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("platform.errors.fetchConfig.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updatePlatformConfig(config: Config) {
  return await api.patch(`${api_root}/platform/config`, { json: config }).json<Config>();
}

export function useUpdatePlatformConfigMutation(
  props: { onSuccess?: (config: Config) => void; onError?: (err: Error) => void } = {}
) {
  return useMutation(() => ({
    mutationFn: (config: Config) => updatePlatformConfig(config),
    onSuccess: (data: Config) => {
      toastSuccess(t("general.actions.save.status.success"));
      props.onSuccess?.(data);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

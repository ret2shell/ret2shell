import type { AuthConfig, Config, ServerConfig } from "@models/config";
import type { HostType } from "@models/game";
import type { Institute } from "@models/institute";
import { luxonReplacer } from "@models/utils";
import type { DateTime } from "luxon";
import api, { api_root } from ".";

export async function getPlatformInfo() {
  return await api.get(`${api_root}/platform/info`).json<ServerConfig>();
}

export async function getAuthConfig() {
  return await api.get(`${api_root}/platform/auth`).json<AuthConfig>();
}

export async function getVersion() {
  return await api.get(`${api_root}/platform/version`).json<string>();
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
    in_game: number;
  };
};

export async function getPlatformStatistics() {
  return await api.get(`${api_root}/platform/statistics`).json<PlatformStatistics>();
}

export async function getPlatformLogs() {
  return await api.get(`${api_root}/platform/logs`).json<string[]>();
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

export type PlatformLicense = {
  issuer: string;
  website: string;
  date: string;
  level: string;
};

export async function getPlatformLicense() {
  return await api.get(`${api_root}/platform/license`).json<PlatformLicense>();
}

export async function getPlatformConfig() {
  return await api.get(`${api_root}/platform/config`).json<Config>();
}

export async function updatePlatformConfig(config: Config) {
  return await api.patch(`${api_root}/platform/config`, { json: config }).json<Config>();
}

export async function updateRegistrarScript(registrar: string) {
  return await api
    .patch(`${api_root}/platform/registrar`, { json: { registrar } })
    .json<{ lint: import("@widgets/editor").DiagnosticMarker[] }>();
}

export async function deleteRegistrarScript() {
  return await api.delete(`${api_root}/platform/registrar`).json<void>();
}

import type { DateTime } from "luxon";

export type SyncSourceLastStatus = "never" | "queued" | "running" | "succeeded" | "failed";

export type SyncJobStatus = "queued" | "running" | "succeeded" | "failed";

export type SyncJobTrigger = "manual" | "scheduled" | "retry";

/**
 * A registered upstream ret2shell instance repository that keeps a local
 * game synchronized. The credential token is write-only: it is only sent in
 * create/update requests and never returned by any API, so this model only
 * exposes whether one is stored.
 */
export type SyncSource = {
  id: number;
  repository_url: string;
  local_game_id: number;
  // joined field, absent when the API does not enrich the local game
  local_game_name?: string;
  has_token: boolean;
  enabled: boolean;
  // null means the source only syncs manually
  interval_seconds: number | null;
  last_synced_oid: string | null;
  next_sync_at: DateTime | null;
  last_attempt_at: DateTime | null;
  last_success_at: DateTime | null;
  last_status: SyncSourceLastStatus;
  last_error: string | null;
  consecutive_failures: number;
  created_at: DateTime;
  updated_at: DateTime;
};

export type SyncJob = {
  id: number;
  source_id: number;
  trigger: SyncJobTrigger;
  status: SyncJobStatus;
  old_oid: string | null;
  new_oid: string | null;
  trace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  log: string | null;
  created_at: DateTime;
  started_at: DateTime | null;
  finished_at: DateTime | null;
};

/**
 * Stable error codes surfaced by the sync service. Each known code maps to an
 * actionable explanation in the admin UI; unknown codes fall back to the raw
 * `error_message`.
 */
export type SyncErrorCode = "unauthorized" | "forbidden" | "local_diverged" | "upstream_diverged" | "target_visible";

export function isSyncErrorCode(code: string | null | undefined): code is SyncErrorCode {
  return (
    code === "unauthorized" ||
    code === "forbidden" ||
    code === "local_diverged" ||
    code === "upstream_diverged" ||
    code === "target_visible"
  );
}

export function isRunningStatus(status: SyncJobStatus | SyncSourceLastStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

export function shortOid(oid: string | null | undefined): string {
  return oid ? oid.slice(0, 7) : "-";
}

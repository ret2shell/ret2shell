import type { DateTime } from "luxon";

export type SyncDistributionLastStatus = "never" | "queued" | "running" | "succeeded" | "failed";

export type SyncJobStatus = "queued" | "running" | "succeeded" | "failed";

export type SyncJobTrigger = "manual" | "scheduled" | "retry";

/**
 * A registered upstream distribution anchored on the source bucket id. The
 * head_ref is the approved admission commit; the credential token is
 * write-only: it is only sent in update requests and never returned by any
 * API, so this model only exposes whether one is stored.
 */
export type SyncDistribution = {
  id: number;
  // the stable sync identity: the source game's real bucket id
  bucket_id: string;
  // base endpoint (scheme + host + api base path) of the source instance
  endpoint: string;
  // the approved admission commit the distribution may sync to
  head_ref: string;
  name: string | null;
  avatar: string | null;
  description: string | null;
  // the community registry index this distribution came from; null marks a
  // direct import whose admission head advances with the source
  registry_url: string | null;
  has_credential: boolean;
  enabled: boolean;
  // null means the distribution only syncs manually
  interval_seconds: number | null;
  last_synced_oid: string | null;
  next_sync_at: DateTime | null;
  last_attempt_at: DateTime | null;
  last_success_at: DateTime | null;
  last_status: SyncDistributionLastStatus;
  last_error: string | null;
  consecutive_failures: number;
  // the local game managed by this distribution, null after unbinding
  managed_game_id: number | null;
  managed_game_name: string | null;
  created_at: DateTime;
  updated_at: DateTime;
};

export type SyncJob = {
  id: number;
  distribution_id: number;
  local_game_id: number;
  trigger: SyncJobTrigger;
  status: SyncJobStatus;
  old_oid: string | null;
  new_oid: string | null;
  // the admission head approved for this specific run
  expected_head: string | null;
  trace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  log: string | null;
  created_at: DateTime;
  started_at: DateTime | null;
  finished_at: DateTime | null;
};

/**
 * One entry of the community registry index. The backend fetches the index
 * server-side and strips the token: only whether one is published travels to
 * the browser, so community imports never handle credentials.
 */
export type RegistryIndexEntry = {
  bucket_id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  endpoint: string;
  // number of alternate download addresses published for this entry; the
  // importer races the primary endpoint against the mirrors
  mirror_count: number;
  head_ref: string;
  has_token: boolean;
};

/**
 * Stable error codes surfaced by the sync service. Each known code maps to an
 * actionable explanation in the admin UI; unknown codes fall back to the raw
 * `error_message`.
 */
export type SyncErrorCode =
  | "unauthorized"
  | "forbidden"
  | "local_diverged"
  | "upstream_diverged"
  | "head_ref_mismatch"
  | "game_missing"
  | "bucket_missing"
  | "bucket_locked"
  | "missing_baseline"
  | "discover_failed"
  | "registry_fetch_failed"
  | "fetch_failed"
  | "candidate_unresolved"
  | "validation_failed"
  | "materialization_failed"
  | "image_sync_failed"
  | "image_digest_mismatch"
  | "rollback_failed"
  | "timeout"
  | "internal_error";

const SYNC_ERROR_CODES: ReadonlySet<string> = new Set([
  "unauthorized",
  "forbidden",
  "local_diverged",
  "upstream_diverged",
  "head_ref_mismatch",
  "game_missing",
  "bucket_missing",
  "bucket_locked",
  "missing_baseline",
  "discover_failed",
  "registry_fetch_failed",
  "fetch_failed",
  "candidate_unresolved",
  "validation_failed",
  "materialization_failed",
  "image_sync_failed",
  "image_digest_mismatch",
  "rollback_failed",
  "timeout",
  "internal_error",
]);

export function isSyncErrorCode(code: string | null | undefined): code is SyncErrorCode {
  return code != null && SYNC_ERROR_CODES.has(code);
}

export function isRunningStatus(status: SyncJobStatus | SyncDistributionLastStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

export function shortOid(oid: string | null | undefined): string {
  return oid ? oid.slice(0, 7) : "-";
}

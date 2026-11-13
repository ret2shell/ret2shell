import { isSyncErrorCode } from "@models/sync";
import { t } from "@storage/theme";
import type { TagProps } from "@widgets/tag";
import type { DateTime } from "luxon";

export type SyncStatusTagLevel = TagProps["level"];

export function syncStatusLevel(status: string): SyncStatusTagLevel {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
      return "error";
    case "running":
      return "info";
    case "queued":
      return "warning";
    default:
      return "layer-content";
  }
}

export function syncStatusText(status: string): string {
  return t(`platform.sync.status.${status}`);
}

export function syncTriggerText(trigger: string): string {
  return t(`platform.sync.trigger.${trigger}`);
}

export function formatSyncTime(time: DateTime | null | undefined): string {
  return time?.toFormat("yyyy-MM-dd HH:mm:ss") ?? "-";
}

/**
 * Maps a job `error_code` (or a source `last_error` that carries a raw code)
 * to an actionable explanation. Unknown codes fall back to the raw code and
 * the original message so nothing is silently hidden from the admin.
 */
export function describeSyncError(
  code: string | null | undefined,
  message: string | null | undefined
): { title: string; hint: string | null } {
  const normalized = code?.trim();
  if (isSyncErrorCode(normalized)) {
    return {
      title: t(`platform.sync.errors.${normalized}.title`),
      hint: t(`platform.sync.errors.${normalized}.hint`),
    };
  }
  return {
    title: normalized || t("platform.sync.errors.unknown.title"),
    hint: message,
  };
}

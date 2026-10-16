import type { Suggestion } from "./types";

/**
 * Field dictionary for ret2shell server logs.
 * `detailKey` is an i18n suffix under `platform.logs.assist.fields`.
 */
export type FieldInfo = {
  name: string;
  detailKey: string;
  /** known value candidates for `field:` completion */
  values?: string[];
  /** value hint i18n suffix under `platform.logs.assist.valueHint` */
  valueHint?: string;
};

export const KNOWN_FIELDS: FieldInfo[] = [
  { name: "_time", detailKey: "time", valueHint: "time" },
  { name: "_msg", detailKey: "msg", valueHint: "msg" },
  { name: "_stream", detailKey: "stream", valueHint: "stream" },
  { name: "level", detailKey: "level", values: ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"] },
  { name: "target", detailKey: "target", valueHint: "target" },
  { name: "spans", detailKey: "spans", valueHint: "spans" },
  { name: "span.name", detailKey: "spanName", valueHint: "spanName" },
  { name: "span.trace", detailKey: "spanTrace", valueHint: "spanTrace" },
  { name: "span.from", detailKey: "spanFrom", valueHint: "spanFrom" },
  {
    name: "span.method",
    detailKey: "spanMethod",
    values: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  },
  { name: "span.uri", detailKey: "spanUri", valueHint: "spanUri" },
  { name: "span.user-id", detailKey: "spanUserId", valueHint: "spanUserId" },
  { name: "span.user-account", detailKey: "spanUserAccount", valueHint: "spanUserAccount" },
  { name: "span.user-nickname", detailKey: "spanUserNickname", valueHint: "spanUserNickname" },
  { name: "span.data-game-id", detailKey: "spanDataGameId", valueHint: "spanDataGameId" },
  { name: "span.data-challenge-id", detailKey: "spanDataChallengeId", valueHint: "spanDataChallengeId" },
];

/**
 * Dynamic field prefixes. Inserting one of these keeps the completion open so
 * the user can continue typing the dynamic part (e.g. `fields.account`).
 */
export const FIELD_PREFIXES: { prefix: string; detailKey: string }[] = [
  { prefix: "fields.", detailKey: "fields" },
  { prefix: "span.data-", detailKey: "spanData" },
];

export function findField(name: string): FieldInfo | undefined {
  return KNOWN_FIELDS.find((f) => f.name.toLowerCase() === name.toLowerCase());
}

export function fieldSuggestions(prefix: string): Suggestion[] {
  const lower = prefix.toLowerCase();
  const fields = KNOWN_FIELDS.filter((f) => f.name.toLowerCase().startsWith(lower)).map((f) => ({
    label: `${f.name}:`,
    insert: `${f.name}:`,
    kind: "field" as const,
    detailKey: f.detailKey,
    retrigger: true,
  }));
  const dynamic = FIELD_PREFIXES.filter((p) => p.prefix.toLowerCase().startsWith(lower)).map((p) => ({
    label: `${p.prefix}…`,
    insert: p.prefix,
    kind: "prefix" as const,
    detailKey: p.detailKey,
    retrigger: true,
  }));
  return [...fields, ...dynamic];
}

/** Value completions for `field:` context. */
export function valueSuggestions(field: FieldInfo | undefined): Suggestion[] {
  const items: Suggestion[] = [];
  if (field?.values) {
    for (const value of field.values) {
      items.push({ label: value, insert: value, kind: "value" });
    }
  }
  // exists / prefix match / regexp helpers apply to every field
  items.push({
    label: "*",
    insert: "*",
    kind: "operator",
    detailKey: "anyValue",
  });
  items.push({
    label: '~"regexp"',
    insert: '~""',
    kind: "operator",
    detailKey: "regexp",
    cursorBack: 1,
  });
  if (field?.name === "_time") {
    items.push(
      { label: "[start, end]", insert: "[, ]", kind: "operator", detailKey: "timeRange", cursorBack: 2 },
      { label: ">=start", insert: ">=", kind: "operator", detailKey: "timeSince", retrigger: true },
      { label: "5m / 1h / 24h / 7d", insert: "24h", kind: "value", detailKey: "timeDuration" }
    );
  }
  return items;
}

/** Pipe command snippets offered after `|`. */
export const PIPE_SNIPPETS: Suggestion[] = [
  { label: "sort by (_time) desc", insert: "sort by (_time) desc", kind: "pipe", detailKey: "sort" },
  { label: "limit N", insert: "limit 100", kind: "pipe", detailKey: "limit" },
  { label: "fields a, b", insert: "fields ", kind: "pipe", detailKey: "fields", retrigger: true },
  { label: "filter …", insert: "filter ", kind: "pipe", detailKey: "filterPipe", retrigger: true },
  { label: "uniq by (…)", insert: "uniq by ()", kind: "pipe", detailKey: "uniq", cursorBack: 1 },
  { label: "extract …", insert: 'extract " regexp " from _msg', kind: "pipe", detailKey: "extract" },
  { label: "copy a as b", insert: "copy ", kind: "pipe", detailKey: "copy", retrigger: true },
  { label: "delete a, b", insert: "delete ", kind: "pipe", detailKey: "delete", retrigger: true },
  { label: "format …", insert: 'format ""', kind: "pipe", detailKey: "format", cursorBack: 1 },
];

/** Boolean / structural keywords offered inside the filter section. */
export const KEYWORD_SUGGESTIONS: Suggestion[] = [
  { label: "AND", insert: "AND ", kind: "keyword", detailKey: "and", retrigger: true },
  { label: "OR", insert: "OR ", kind: "keyword", detailKey: "or", retrigger: true },
  { label: "NOT", insert: "NOT ", kind: "keyword", detailKey: "not", retrigger: true },
  { label: "( … )", insert: "()", kind: "keyword", detailKey: "group", cursorBack: 1 },
];

/**
 * Common query presets shown when the input is empty.
 * `labelKey` / `descKey` are i18n suffixes under `platform.logs.assist.presets`.
 */
export const QUERY_PRESETS: { id: string; labelKey: string; descKey: string; query: string }[] = [
  {
    id: "errors",
    labelKey: "errors",
    descKey: "errorsDesc",
    query: "level:ERROR | sort by (_time) desc | limit 100",
  },
  {
    id: "warnAndError",
    labelKey: "warnAndError",
    descKey: "warnAndErrorDesc",
    query: "level:WARN OR level:ERROR | sort by (_time) desc | limit 100",
  },
  {
    id: "recentErrors",
    labelKey: "recentErrors",
    descKey: "recentErrorsDesc",
    query: "_time:>=1h AND level:ERROR | sort by (_time) desc",
  },
  {
    id: "byUser",
    labelKey: "byUser",
    descKey: "byUserDesc",
    query: "span.user-account:* | sort by (_time) desc | limit 100",
  },
  {
    id: "byIp",
    labelKey: "byIp",
    descKey: "byIpDesc",
    query: "span.from:* | sort by (_time) desc | limit 100",
  },
  {
    id: "byTrace",
    labelKey: "byTrace",
    descKey: "byTraceDesc",
    query: "span.trace:* | sort by (_time) asc",
  },
  {
    id: "loginAudit",
    labelKey: "loginAudit",
    descKey: "loginAuditDesc",
    query: "span.uri:/account/login | sort by (_time) desc | limit 100",
  },
  {
    id: "submissions",
    labelKey: "submissions",
    descKey: "submissionsDesc",
    query: "span.uri:*submit* | sort by (_time) desc | limit 100",
  },
  {
    id: "module",
    labelKey: "module",
    descKey: "moduleDesc",
    query: "target:r2s_server::worker* | sort by (_time) desc | limit 100",
  },
];

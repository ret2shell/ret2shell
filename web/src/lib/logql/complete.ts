import { booleanKeyword, lex } from "./lexer";
import {
  fieldSuggestions,
  findField,
  KEYWORD_SUGGESTIONS,
  KNOWN_FIELDS,
  PIPE_SNIPPETS,
  valueSuggestions,
} from "./schema";
import type { CompletionResult, Suggestion, Token } from "./types";

const PIPE_STARTERS: Suggestion[] = [
  { label: "| sort by (_time) desc", insert: " | sort by (_time) desc", kind: "pipe", detailKey: "sort" },
  { label: "| limit N", insert: " | limit 100", kind: "pipe", detailKey: "limit" },
  { label: "| fields …", insert: " | fields ", kind: "pipe", detailKey: "fields", retrigger: true },
  {
    label: "| stats by (…) count()",
    insert: " | stats by () count()",
    kind: "pipe",
    detailKey: "stats",
    cursorBack: 9,
  },
];

const LIMIT_VALUES = ["10", "20", "50", "100", "1000"];

/** last non-eof token whose end <= cursor */
function prevToken(tokens: Token[], cursor: number): Token | undefined {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].kind !== "eof" && tokens[i].end <= cursor) return tokens[i];
  }
  return undefined;
}

/** token currently being edited: start <= cursor <= end (excluding eof) */
function currentToken(tokens: Token[], cursor: number): Token | undefined {
  return tokens.find((t) => t.kind !== "eof" && t.start <= cursor && cursor <= t.end);
}

function tokenBefore(tokens: Token[], token: Token): Token | undefined {
  const idx = tokens.indexOf(token);
  return idx > 0 ? tokens[idx - 1] : undefined;
}

function tokenAfter(tokens: Token[], token: Token): Token | undefined {
  const idx = tokens.indexOf(token);
  return idx >= 0 && idx < tokens.length - 1 ? tokens[idx + 1] : undefined;
}

function filterByPrefix(items: Suggestion[], prefix: string): Suggestion[] {
  if (!prefix) return items;
  const lower = prefix.toLowerCase();
  return items.filter(
    (item) => item.label.toLowerCase().startsWith(lower) || item.insert.toLowerCase().startsWith(lower)
  );
}

/** does this token terminate a predicate (so the next word starts a new one)? */
function endsPredicate(token: Token | undefined): boolean {
  if (!token) return false;
  return token.kind === "word" || token.kind === "string" || token.kind === "rparen" || token.kind === "rbracket";
}

function isBooleanOrNot(token: Token | undefined): boolean {
  return !!token && booleanKeyword(token) !== undefined;
}

/**
 * Value completion context: cursor sits in / right after the value position of
 * a `field:value` pair. Returns the field name when detected.
 */
function valueContext(tokens: Token[], cursor: number, current: Token | undefined): string | undefined {
  if (current && (current.kind === "word" || current.kind === "string") && current.start < cursor) {
    const colon = tokenBefore(tokens, current);
    if (colon?.kind === "colon" && colon.end <= current.start) {
      const field = tokenBefore(tokens, colon);
      if (field?.kind === "word") return field.value;
    }
  }
  const prev = prevToken(tokens, cursor);
  if (prev?.kind === "colon" || prev?.kind === "tilde" || prev?.kind === "cmp") {
    const field = prev.kind === "colon" ? tokenBefore(tokens, prev) : tokenBefore(tokens, prev);
    if (field?.kind === "word") return field.value;
  }
  return undefined;
}

function valueCompletion(fieldName: string, prefix: string, from: number, to: number): CompletionResult {
  const field = findField(fieldName);
  let items = valueSuggestions(field);
  if (field?.values) {
    items = filterByPrefix(items, prefix);
  } else if (prefix) {
    // free-form value: do not interrupt typing with non-matching helpers
    items = [];
  }
  return { from, to, items };
}

/** completions for the `by (…)` / field-list arguments of pipe commands */
function pipeFieldCompletion(prefix: string, from: number, to: number): CompletionResult {
  const items: Suggestion[] = KNOWN_FIELDS.filter((f) => f.name !== "_stream").map((f) => ({
    label: f.name,
    insert: f.name,
    kind: "field" as const,
    detailKey: f.detailKey,
  }));
  return { from, to, items: filterByPrefix(items, prefix) };
}

export function getCompletions(source: string, cursor: number): CompletionResult {
  const tokens = lex(source);
  const current = currentToken(tokens, cursor);
  const firstPipe = tokens.find((t) => t.kind === "pipe");

  // ── pipe section ──────────────────────────────────────────────────────
  if (firstPipe && cursor > firstPipe.start) {
    return pipeCompletions(tokens, cursor, current, firstPipe);
  }

  // ── filter section ────────────────────────────────────────────────────
  // field value context: `field:<cursor>` / `field:val<cursor>`
  const valueField = valueContext(tokens, cursor, current);
  if (valueField !== undefined) {
    const editing = current && (current.kind === "word" || current.kind === "string");
    // replace through the end of the value token, and filter by the text
    // actually typed before the caret
    const from = editing ? current.start : cursor;
    const to = editing ? current.end : cursor;
    const prefix = editing ? source.slice(current.start, cursor) : "";
    return valueCompletion(valueField, prefix, from, to);
  }

  // editing a word → field-name completion (+ boolean keywords)
  if (current && current.kind === "word" && current.start < cursor) {
    // when an existing colon follows the word, swallow it so accepting a
    // `field:` suggestion does not produce `field::`
    const next = tokenAfter(tokens, current);
    const to = next?.kind === "colon" ? next.end : current.end;
    return {
      from: current.start,
      to,
      items: [...fieldSuggestions(current.value), ...filterByPrefix(KEYWORD_SUGGESTIONS, current.value)],
    };
  }

  const prev = prevToken(tokens, cursor);
  if (!prev || isBooleanOrNot(prev) || prev.kind === "lparen") {
    // predicate start: fields + NOT + group
    const items: Suggestion[] = [
      ...fieldSuggestions(""),
      ...KEYWORD_SUGGESTIONS.filter((s) => s.label === "NOT" || s.label === "( … )"),
    ];
    return { from: cursor, to: cursor, items };
  }

  if (prev.kind === "pipe") {
    return { from: cursor, to: cursor, items: PIPE_SNIPPETS };
  }

  if (endsPredicate(prev)) {
    return { from: cursor, to: cursor, items: [...KEYWORD_SUGGESTIONS, ...PIPE_STARTERS] };
  }

  return { from: cursor, to: cursor, items: [] };
}

function pipeCompletions(
  tokens: Token[],
  cursor: number,
  current: Token | undefined,
  _firstPipe: Token
): CompletionResult {
  // tokens of the pipe command the cursor belongs to
  const pipesBefore = tokens.filter((t) => t.kind === "pipe" && t.start < cursor);
  const pipeToken = pipesBefore[pipesBefore.length - 1];
  const commandTokens = tokens.filter(
    (t) => t.kind !== "eof" && t.start >= pipeToken.end && (t.kind !== "pipe" || t.start >= cursor)
  );
  const name = commandTokens.find((t) => t.kind === "word");

  // command position: cursor directly after `|` or editing the command name
  if (
    !name ||
    name.start >= cursor ||
    (current !== undefined && current === name && commandTokens.indexOf(name) === 0)
  ) {
    const editing = current !== undefined && current === name && current.kind === "word" && current.start < cursor;
    const prefix = editing ? current.value : "";
    return {
      from: editing ? current.start : cursor,
      to: editing ? current.end : cursor,
      items: filterByPrefix(PIPE_SNIPPETS, prefix),
    };
  }

  const command = name.value.toLowerCase();
  // only tokens before the caret describe the current context; tokens after
  // the caret (e.g. an existing closing paren) must not steer completion
  const args = commandTokens.slice(commandTokens.indexOf(name) + 1).filter((t) => t.start < cursor);
  const prev = prevToken(tokens, cursor);

  const editingWord = current && current.kind === "word" && current.start < cursor ? current : undefined;
  const from = editingWord ? editingWord.start : cursor;
  const to = editingWord ? editingWord.end : cursor;
  const prefix = editingWord ? editingWord.value : "";

  // per-command argument completion
  const own = pipeArgCompletion(command, name, args, prev, editingWord, prefix, from, to);
  if (own) return own;

  // after a finished command → chain another pipe
  if (prev && prev !== name && args.length > 0) {
    return { from: cursor, to: cursor, items: PIPE_STARTERS };
  }
  return { from: cursor, to: cursor, items: [] };
}

function pipeArgCompletion(
  command: string,
  name: Token,
  args: Token[],
  prev: Token | undefined,
  editingWord: Token | undefined,
  prefix: string,
  from: number,
  to: number
): CompletionResult | undefined {
  switch (command) {
    case "sort": {
      const hasOpen = args.some((t) => t.kind === "lparen");
      const hasClose = args.some((t) => t.kind === "rparen");
      if (args.length === 0 && !editingWord) {
        return { from, to, items: [{ label: "by (_time) desc", insert: "by (_time) desc", kind: "keyword" }] };
      }
      if (hasClose) {
        const lastArg = args[args.length - 1];
        // direction already given → let the caller suggest chaining
        if (!editingWord && (lastArg.value === "asc" || lastArg.value === "desc")) return undefined;
        if (!editingWord && lastArg.kind !== "rparen") return undefined;
        return {
          from,
          to,
          items: filterByPrefix(
            [
              { label: "desc", insert: "desc", kind: "keyword" },
              { label: "asc", insert: "asc", kind: "keyword" },
            ],
            prefix
          ),
        };
      }
      if (hasOpen) return pipeFieldCompletion(prefix, from, to);
      return undefined;
    }
    case "limit": {
      // value already given → let the caller suggest chaining
      if (args.length > 0 && !editingWord && prev !== name) return undefined;
      return {
        from,
        to,
        items: LIMIT_VALUES.map((v) => ({ label: v, insert: v, kind: "value" as const })).filter((s) =>
          s.label.startsWith(prefix)
        ),
      };
    }
    case "fields":
    case "copy":
    case "delete":
    case "rm":
    case "rename":
    case "uniq":
    case "stats":
    case "top":
    case "filter": {
      // after a complete `by (…)` group, allow chaining
      const hasClose = args.some((t) => t.kind === "rparen");
      const hasOpen = args.some((t) => t.kind === "lparen");
      if (hasOpen && hasClose && !editingWord) return undefined;
      return pipeFieldCompletion(prefix, from, to);
    }
    default:
      return undefined;
  }
}

/** convenience re-export for the UI */
export { FIELD_PREFIXES, QUERY_PRESETS } from "./schema";

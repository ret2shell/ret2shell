import type { Token, TokenKind } from "./types";

const SINGLE_CHAR_TOKENS: Record<string, TokenKind> = {
  ":": "colon",
  "(": "lparen",
  ")": "rparen",
  "[": "lbracket",
  "]": "rbracket",
  ",": "comma",
  "|": "pipe",
  "~": "tilde",
};

/**
 * Tokenize LogsQL source. Word characters are anything except whitespace and
 * structural punctuation, so `span.user-account`, `10.0.0.1`, `foo*` and
 * `2026-01-01T00:00:00Z` are all single words.
 */
export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }

    // quoted string (single or double quotes)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let value = "";
      let terminated = false;
      while (i < n) {
        const c = source[i];
        if (c === "\\" && i + 1 < n) {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) {
          terminated = true;
          i++;
          break;
        }
        value += c;
        i++;
      }
      tokens.push({
        kind: "string",
        text: source.slice(start, i),
        value,
        start,
        end: i,
        terminated,
      });
      continue;
    }

    // comparison operators
    if (ch === ">" || ch === "<" || ch === "=") {
      const start = i;
      if ((ch === ">" || ch === "<") && source[i + 1] === "=") {
        i += 2;
      } else {
        i++;
      }
      tokens.push({ kind: "cmp", text: source.slice(start, i), value: source.slice(start, i), start, end: i });
      continue;
    }

    const single = SINGLE_CHAR_TOKENS[ch];
    if (single) {
      tokens.push({ kind: single, text: ch, value: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    // bare word
    const start = i;
    while (i < n && !" \t\r\n\"'()[]{},|:<>=~".includes(source[i])) {
      i++;
    }
    // exotic characters outside the grammar (e.g. `{` / `}`) must still
    // consume input, otherwise the scanner loops forever
    if (i === start) i++;
    tokens.push({
      kind: "word",
      text: source.slice(start, i),
      value: source.slice(start, i),
      start,
      end: i,
    });
  }

  tokens.push({ kind: "eof", text: "", value: "", start: n, end: n });
  return tokens;
}

/** Case-insensitive keyword test for AND / OR / NOT. */
export function booleanKeyword(token: Token): "and" | "or" | "not" | undefined {
  if (token.kind !== "word") return undefined;
  const lower = token.value.toLowerCase();
  if (lower === "and" || lower === "or" || lower === "not") return lower;
  return undefined;
}

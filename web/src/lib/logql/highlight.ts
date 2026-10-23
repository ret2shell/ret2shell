import { booleanKeyword, lex } from "./lexer";
import { PIPE_COMMANDS } from "./parser";
import type { Diagnostic, Token } from "./types";

/**
 * Token classification for the query input overlay. Colors follow the
 * platform code-style conventions (see `ansi-color.css`): fields map to
 * `primary`, string values to `success`, boolean keywords to `warning`,
 * pipe commands and functions to `info`, everything structural stays dim.
 */
export type HighlightSegment = {
  start: number;
  end: number;
  /** tailwind classes applied to the source range */
  cls: string;
};

const ERROR_UNDERLINE = "underline decoration-wavy decoration-error underline-offset-2";

function isPipeCommand(prev: Token | undefined, token: Token): boolean {
  if (token.kind !== "word" || prev?.kind !== "pipe") return false;
  const lower = token.value.toLowerCase();
  return (PIPE_COMMANDS as readonly string[]).includes(lower);
}

function isNumeric(token: Token): boolean {
  return /^\d+(?:[.:]\d+)*$/.test(token.value);
}

/**
 * Build colored segments for a LogsQL source string. Uncovered ranges keep
 * the default text color, so only `segments` needs rendering. Diagnostic
 * ranges get a wavy error underline layered on top of the base color.
 */
export function highlight(source: string, diagnostics: Diagnostic[] = []): HighlightSegment[] {
  const tokens = lex(source);
  const segments: HighlightSegment[] = [];

  const push = (token: Token, cls: string) => {
    if (token.end > token.start) segments.push({ start: token.start, end: token.end, cls });
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === "eof") break;
    switch (token.kind) {
      case "string":
        push(token, `text-success${token.terminated ? "" : ` ${ERROR_UNDERLINE}`}`);
        break;
      case "word": {
        const next = tokens[i + 1];
        const prev = tokens[i - 1];
        if (next?.kind === "colon") {
          push(token, "text-primary");
        } else if (booleanKeyword(token)) {
          push(token, "text-warning font-bold");
        } else if (next?.kind === "lparen" && token.value.toLowerCase() !== "by") {
          // function-style filter, e.g. `exists(level)`; `by (...)` is a
          // grouping clause, not a function
          push(token, "text-info font-bold");
        } else if (isPipeCommand(prev, token)) {
          push(token, "text-info font-bold");
        } else if (isNumeric(token)) {
          push(token, "text-warning");
        }
        break;
      }
      case "pipe":
        push(token, "text-layer-content/50");
        break;
      case "colon":
      case "cmp":
      case "lparen":
      case "rparen":
      case "lbracket":
      case "rbracket":
      case "comma":
      case "tilde":
        push(token, "text-layer-content/50");
        break;
    }
  }

  // layer diagnostic underlines on top of the token colors by splitting
  // the overlapping segments
  for (const diag of diagnostics) {
    if (diag.end <= diag.start) continue;
    const split: HighlightSegment[] = [];
    for (const seg of segments) {
      if (seg.end <= diag.start || seg.start >= diag.end) {
        split.push(seg);
        continue;
      }
      if (seg.start < diag.start) {
        split.push({ start: seg.start, end: diag.start, cls: seg.cls });
      }
      const midStart = Math.max(seg.start, diag.start);
      const midEnd = Math.min(seg.end, diag.end);
      const cls = seg.cls.includes(ERROR_UNDERLINE) ? seg.cls : `${seg.cls} ${ERROR_UNDERLINE}`;
      split.push({ start: midStart, end: midEnd, cls });
      if (seg.end > diag.end) {
        split.push({ start: diag.end, end: seg.end, cls: seg.cls });
      }
    }
    segments.length = 0;
    segments.push(...split);
  }

  segments.sort((a, b) => a.start - b.start);
  return segments;
}

/**
 * Lightweight LogsQL (VictoriaLogs query language) lexer / parser /
 * completion engine, used by the admin log query input.
 *
 * The parser is intentionally tolerant: it never throws, and collects
 * diagnostics so partially-typed queries still produce useful completions.
 */

export type TokenKind =
  | "word"
  | "string"
  | "colon"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "pipe"
  | "cmp"
  | "tilde"
  | "eof";

export type Token = {
  kind: TokenKind;
  /** raw source slice, quotes included for strings */
  text: string;
  /** unquoted / unescaped value for strings, raw text otherwise */
  value: string;
  start: number;
  end: number;
  /** whether a string token was properly terminated */
  terminated?: boolean;
};

export type Diagnostic = {
  /** i18n key suffix under `platform.logs.assist.diag` */
  code:
    | "unclosedString"
    | "unclosedParen"
    | "unexpectedParen"
    | "unclosedBracket"
    | "unexpectedBracket"
    | "missingValue"
    | "danglingOperator"
    | "emptyGroup"
    | "missingCommand"
    | "unknownCommand";
  start: number;
  end: number;
  params?: Record<string, string | number>;
};

export type FilterNode =
  | { type: "phrase"; token: Token }
  | {
      type: "field";
      field: Token;
      cmp?: Token;
      value?: Token;
      range?: { open: Token; close?: Token };
    }
  | { type: "not"; child?: FilterNode; token: Token }
  | { type: "and" | "or"; children: FilterNode[] }
  | { type: "group"; child?: FilterNode; open: Token; close?: Token };

export type PipeCommand = {
  pipe: Token;
  name?: Token;
  args: Token[];
};

export type QueryAst = {
  filter?: FilterNode;
  pipes: PipeCommand[];
  diagnostics: Diagnostic[];
};

export type SuggestionKind = "field" | "value" | "keyword" | "pipe" | "operator" | "prefix";

export type Suggestion = {
  /** text displayed in the dropdown */
  label: string;
  /** text inserted when accepted */
  insert: string;
  kind: SuggestionKind;
  /** i18n key suffix under `platform.logs.assist.detail` */
  detailKey?: string;
  /** move cursor this many chars back from the end after insertion */
  cursorBack?: number;
  /** keep the dropdown open and immediately re-complete after insertion */
  retrigger?: boolean;
};

export type CompletionResult = {
  /** replace range in the source */
  from: number;
  to: number;
  items: Suggestion[];
};

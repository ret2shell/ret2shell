import { booleanKeyword, lex } from "./lexer";
import type { Diagnostic, FilterNode, PipeCommand, QueryAst, Token } from "./types";

/** Known LogsQL pipe commands (case-insensitive). */
export const PIPE_COMMANDS = [
  "blocks",
  "collapse_nums",
  "copy",
  "delete",
  "extract",
  "extract_regexp",
  "facets",
  "fields",
  "filter",
  "format",
  "generate",
  "join",
  "json_array_len",
  "len",
  "limit",
  "math",
  "offset",
  "pack_json",
  "pack_logfmt",
  "query",
  "rename",
  "replace",
  "replace_regexp",
  "rm",
  "sample",
  "sequence",
  "sort",
  "split",
  "stats",
  "stream_context",
  "subquery",
  "time_add",
  "top",
  "union",
  "uniq",
  "unpack_json",
  "unpack_logfmt",
  "unroll",
  "values",
] as const;

class Parser {
  private pos = 0;
  private diagnostics: Diagnostic[] = [];

  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.pos++;
    return token;
  }

  private diag(code: Diagnostic["code"], start: number, end: number, params?: Diagnostic["params"]) {
    this.diagnostics.push({ code, start, end, params });
  }

  parse(): QueryAst {
    let filter: FilterNode | undefined;
    const first = this.peek();
    if (first.kind !== "pipe" && first.kind !== "eof") {
      filter = this.parseOr();
    }
    const pipes = this.parsePipes();
    return { filter, pipes, diagnostics: this.diagnostics };
  }

  private parsePipes(): PipeCommand[] {
    const pipes: PipeCommand[] = [];
    for (;;) {
      while (this.peek().kind === "pipe") {
        const pipe = this.next();
        const command: PipeCommand = { pipe, args: [] };
        const name = this.peek();
        if (name.kind === "word" && booleanKeyword(name) === undefined) {
          command.name = this.next();
          if (!PIPE_COMMANDS.includes(command.name.value.toLowerCase() as (typeof PIPE_COMMANDS)[number])) {
            this.diag("unknownCommand", name.start, name.end, { command: name.value });
          }
        } else if (name.kind !== "pipe" && name.kind !== "eof") {
          // e.g. `| "foo"` — not a command
          this.diag("unknownCommand", name.start, name.end, { command: name.text });
        } else {
          this.diag("missingCommand", pipe.start, pipe.end);
        }
        // consume args until next top-level pipe or eof, tracking delimiter
        // balance; a pipe inside a parenthesized subquery belongs to the args
        const openStack: Token[] = [];
        for (;;) {
          const ahead = this.peek();
          if (ahead.kind === "eof") break;
          if (ahead.kind === "pipe" && openStack.length === 0) break;
          const token = this.next();
          if (token.kind === "string" && !token.terminated) {
            this.diag("unclosedString", token.start, token.end);
          }
          if (token.kind === "lparen" || token.kind === "lbracket") {
            openStack.push(token);
          } else if (token.kind === "rparen" || token.kind === "rbracket") {
            // time ranges may mix brackets, e.g. `_time:[start, end)`
            if (openStack.length > 0) {
              openStack.pop();
            } else {
              this.diag(token.kind === "rparen" ? "unexpectedParen" : "unexpectedBracket", token.start, token.end);
            }
          }
          command.args.push(token);
        }
        for (const open of openStack) {
          this.diag(open.kind === "lparen" ? "unclosedParen" : "unclosedBracket", open.start, open.end);
        }
        pipes.push(command);
      }
      // trailing tokens that are not pipes (e.g. unmatched closing parens);
      // loop back in case another pipe command follows them
      while (this.peek().kind !== "eof" && this.peek().kind !== "pipe") {
        const token = this.next();
        if (token.kind === "rparen") this.diag("unexpectedParen", token.start, token.end);
        if (token.kind === "rbracket") this.diag("unexpectedBracket", token.start, token.end);
      }
      if (this.peek().kind !== "pipe") break;
    }
    return pipes;
  }

  private parseOr(): FilterNode {
    const children: FilterNode[] = [];
    const node = this.parseAnd();
    if (node) children.push(node);
    while (booleanKeyword(this.peek()) === "or") {
      this.next();
      const rhs = this.parseAnd();
      if (rhs) {
        children.push(rhs);
      } else {
        const prev = this.tokens[this.pos - 1];
        this.diag("danglingOperator", prev.start, prev.end, { operator: "OR" });
      }
    }
    if (children.length === 0) {
      // empty filter; represent as a phrase over eof to keep types simple
      const eof = this.peek();
      return { type: "phrase", token: eof };
    }
    return children.length === 1 ? children[0] : { type: "or", children };
  }

  private parseAnd(): FilterNode | undefined {
    const children: FilterNode[] = [];
    for (;;) {
      const token = this.peek();
      if (token.kind === "eof" || token.kind === "pipe" || token.kind === "rparen") break;
      if (booleanKeyword(token) === "or") break;
      if (booleanKeyword(token) === "and") {
        const and = this.next();
        const next = this.peek();
        // NOT is a valid operand start; only AND/OR/end-of-expression dangle
        const nextKw = booleanKeyword(next);
        if (
          next.kind === "eof" ||
          next.kind === "pipe" ||
          next.kind === "rparen" ||
          nextKw === "and" ||
          nextKw === "or"
        ) {
          this.diag("danglingOperator", and.start, and.end, { operator: "AND" });
          break;
        }
        continue;
      }
      const unary = this.parseUnary();
      if (unary) children.push(unary);
      else break;
    }
    if (children.length === 0) return undefined;
    return children.length === 1 ? children[0] : { type: "and", children };
  }

  private parseUnary(): FilterNode | undefined {
    const token = this.peek();
    if (booleanKeyword(token) === "not") {
      const not = this.next();
      const next = this.peek();
      const nextKw = booleanKeyword(next);
      if (
        next.kind === "eof" ||
        next.kind === "pipe" ||
        next.kind === "rparen" ||
        nextKw === "and" ||
        nextKw === "or"
      ) {
        this.diag("danglingOperator", not.start, not.end, { operator: "NOT" });
        return { type: "not", token: not };
      }
      return { type: "not", token: not, child: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FilterNode | undefined {
    const token = this.peek();

    if (token.kind === "lparen") {
      const open = this.next();
      const next = this.peek();
      if (next.kind === "rparen") {
        const close = this.next();
        this.diag("emptyGroup", open.start, close.end);
        return { type: "group", open, close };
      }
      const child = this.parseOr();
      let close: Token | undefined;
      if (this.peek().kind === "rparen") {
        close = this.next();
      } else {
        this.diag("unclosedParen", open.start, open.end);
      }
      return { type: "group", child, open, close };
    }

    if (token.kind === "rparen") {
      this.diag("unexpectedParen", token.start, token.end);
      this.next();
      return undefined;
    }

    if (token.kind === "rbracket") {
      this.diag("unexpectedBracket", token.start, token.end);
      this.next();
      return undefined;
    }

    if (token.kind === "word" || token.kind === "string") {
      const first = this.next();
      if (first.kind === "string" && !first.terminated) {
        this.diag("unclosedString", first.start, first.end);
      }
      // field filter: word ":" ...
      if (first.kind === "word" && this.peek().kind === "colon") {
        this.next(); // colon
        return this.parseFieldValue(first);
      }
      return { type: "phrase", token: first };
    }

    // stray structural token (comma, colon, lbracket, cmp, tilde) — skip it
    this.next();
    return undefined;
  }

  private parseFieldValue(field: Token): FilterNode {
    const token = this.peek();
    const node: FilterNode = { type: "field", field };

    // range filter: field:[a, b] / field:(a, b)
    if (token.kind === "lbracket" || token.kind === "lparen") {
      const open = this.next();
      let close: Token | undefined;
      while (this.peek().kind !== "eof" && this.peek().kind !== "pipe") {
        const t = this.next();
        // time ranges may mix brackets, e.g. `_time:[start, end)`
        if (t.kind === "rbracket" || t.kind === "rparen") {
          close = t;
          break;
        }
        if (t.kind === "string" && !t.terminated) {
          this.diag("unclosedString", t.start, t.end);
        }
      }
      if (!close) {
        this.diag("unclosedBracket", open.start, open.end);
      }
      node.range = { open, close };
      return node;
    }

    // comparison filter: field:>5
    if (token.kind === "cmp") {
      const cmp = this.next();
      node.cmp = cmp;
      const value = this.peek();
      if (value.kind === "word" || value.kind === "string") {
        const v = this.next();
        if (v.kind === "string" && !v.terminated) this.diag("unclosedString", v.start, v.end);
        node.value = v;
      } else {
        this.diag("missingValue", cmp.start, cmp.end, { field: field.value });
      }
      return node;
    }

    // regexp filter: field:~"re"
    if (token.kind === "tilde") {
      this.next();
      const value = this.peek();
      if (value.kind === "word" || value.kind === "string") {
        const v = this.next();
        if (v.kind === "string" && !v.terminated) this.diag("unclosedString", v.start, v.end);
        node.value = v;
      } else {
        this.diag("missingValue", token.start, token.end, { field: field.value });
      }
      return node;
    }

    // plain value: field:word / field:"phrase" / field:*
    // boolean keywords right after `:` are treated as a missing value
    if ((token.kind === "word" || token.kind === "string") && !booleanKeyword(token)) {
      const v = this.next();
      if (v.kind === "string" && !v.terminated) this.diag("unclosedString", v.start, v.end);
      node.value = v;
      let valueEnd = v.end;
      if (v.kind === "word") {
        // bare values may contain further colons (e.g. `target:r2s_server::worker*`);
        // only adjacent colons belong to the value, spaced ones do not
        while (this.peek().kind === "colon" && this.peek().start === valueEnd) {
          const colon = this.next();
          valueEnd = colon.end;
          if (this.peek().kind === "word" && this.peek().start === valueEnd) {
            valueEnd = this.next().end;
          }
        }
        // function-style filter: field:in(a, b) — only when the opening
        // paren is directly adjacent to the value
        const open = this.peek();
        if (open.kind === "lparen" && open.start === valueEnd) {
          this.next();
          let depth = 1;
          let close: Token | undefined;
          while (depth > 0 && this.peek().kind !== "eof" && this.peek().kind !== "pipe") {
            const t = this.next();
            if (t.kind === "string" && !t.terminated) this.diag("unclosedString", t.start, t.end);
            if (t.kind === "lparen") depth++;
            if (t.kind === "rparen") {
              depth--;
              if (depth === 0) close = t;
            }
          }
          if (!close) this.diag("unclosedParen", open.start, open.end);
          node.range = { open, close };
        }
      }
      return node;
    }

    this.diag("missingValue", field.start, field.end, { field: field.value });
    return node;
  }
}

export function parse(source: string): QueryAst {
  return new Parser(lex(source)).parse();
}

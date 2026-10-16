import { describe, expect, it } from "vitest";
import { getCompletions } from "./complete";
import { lex } from "./lexer";
import { parse } from "./parser";

import { QUERY_PRESETS } from "./schema";

type CompletionRange = { from: number; to: number; labels: string[] };

function complete(source: string, cursor = source.length): CompletionRange {
  const result = getCompletions(source, cursor);
  return { from: result.from, to: result.to, labels: result.items.map((i) => i.label) };
}

function labels(source: string, cursor = source.length): string[] {
  return complete(source, cursor).labels;
}

function diagCodes(source: string): string[] {
  return parse(source).diagnostics.map((d) => d.code);
}

describe("lexer", () => {
  it("splits field filters into word/colon/value", () => {
    const tokens = lex("level:INFO");
    expect(tokens.map((t) => t.kind)).toEqual(["word", "colon", "word", "eof"]);
    expect(tokens[0].value).toBe("level");
    expect(tokens[2].value).toBe("INFO");
  });

  it("keeps dots and dashes inside words", () => {
    const tokens = lex("span.user-account:admin");
    expect(tokens[0].value).toBe("span.user-account");
  });

  it("marks unterminated strings", () => {
    const tokens = lex('_msg:"hello');
    expect(tokens[2]).toMatchObject({ kind: "string", terminated: false });
  });
});

describe("parser diagnostics", () => {
  it("accepts a valid full query", () => {
    expect(diagCodes("level:ERROR AND span.uri:/account/login | sort by (_time) desc | limit 100")).toEqual([]);
  });

  it("flags unclosed strings", () => {
    expect(diagCodes('_msg:"hello')).toContain("unclosedString");
  });

  it("flags unclosed parens", () => {
    expect(diagCodes("(level:ERROR")).toContain("unclosedParen");
  });

  it("flags unexpected parens", () => {
    expect(diagCodes("level:ERROR)")).toContain("unexpectedParen");
  });

  it("flags missing field values", () => {
    expect(diagCodes("level:")).toContain("missingValue");
    expect(diagCodes("level: AND target:x")).toContain("missingValue");
  });

  it("flags dangling boolean operators", () => {
    expect(diagCodes("level:ERROR AND")).toContain("danglingOperator");
    expect(diagCodes("NOT")).toContain("danglingOperator");
  });

  it("flags empty groups", () => {
    expect(diagCodes("()")).toContain("emptyGroup");
  });

  it("flags missing pipe commands", () => {
    expect(diagCodes("level:ERROR |")).toContain("missingCommand");
  });

  it("flags unknown pipe commands", () => {
    expect(diagCodes("level:ERROR | frobnicate 1")).toContain("unknownCommand");
  });

  it("accepts time ranges and comparisons", () => {
    expect(diagCodes("_time:[2026-01-01, 2026-01-02] | limit 10")).toEqual([]);
    expect(diagCodes("_time:>=1h")).toEqual([]);
  });
});

describe("completion", () => {
  it("suggests fields at predicate start", () => {
    const items = labels("");
    expect(items).toContain("level:");
    expect(items).toContain("span.user-account:");
    expect(items).toContain("NOT");
  });

  it("filters fields by prefix", () => {
    const items = labels("span.user-a");
    expect(items).toEqual(["span.user-account:"]);
  });

  it("suggests known values after a field colon", () => {
    expect(labels("level:")).toEqual(expect.arrayContaining(["INFO", "ERROR", "*"]));
  });

  it("filters values by typed prefix", () => {
    expect(labels("level:ERR")).toEqual(["ERROR"]);
  });

  it("suggests http methods for span.method", () => {
    expect(labels("span.method:")).toEqual(expect.arrayContaining(["GET", "POST"]));
  });

  it("suggests boolean keywords and pipes after a predicate", () => {
    const items = labels("level:ERROR ");
    expect(items).toEqual(expect.arrayContaining(["AND", "OR", "| sort by (_time) desc", "| limit N"]));
  });

  it("suggests pipe commands after a pipe", () => {
    const items = labels("level:ERROR | ");
    expect(items).toEqual(expect.arrayContaining(["sort by (_time) desc", "limit N"]));
  });

  it("filters pipe commands by prefix", () => {
    expect(labels("level:ERROR | so")).toEqual(["sort by (_time) desc"]);
  });

  it("suggests fields inside sort by parens", () => {
    const items = labels("level:ERROR | sort by (");
    expect(items).toContain("_time");
  });

  it("suggests sort direction after closing paren", () => {
    expect(labels("level:ERROR | sort by (_time) ")).toEqual(expect.arrayContaining(["desc", "asc"]));
  });

  it("suggests limit values", () => {
    expect(labels("level:ERROR | limit ")).toEqual(expect.arrayContaining(["100", "1000"]));
  });

  it("suggests chained pipes after a finished command", () => {
    expect(labels("level:ERROR | limit 100 ")).toEqual(expect.arrayContaining(["| sort by (_time) desc"]));
  });

  it("does not offer value helpers for free-form fields while typing", () => {
    expect(labels("span.user-account:adm")).toEqual([]);
  });

  it("suggests fields after AND", () => {
    expect(labels("level:ERROR AND ")).toContain("target:");
  });

  it("accepts NOT as the operand of AND", () => {
    expect(diagCodes("level:ERROR AND NOT span.uri:/health")).toEqual([]);
  });
});

describe("regressions from review", () => {
  it("lexer terminates on exotic characters like braces", () => {
    const tokens = lex("{}");
    expect(tokens.map((t) => t.kind)).toEqual(["word", "word", "eof"]);
  });

  it("flags unbalanced parens inside pipe arguments", () => {
    expect(diagCodes("* | sort by (_time")).toContain("unclosedParen");
    expect(diagCodes("* | sort by (_time))")).toContain("unexpectedParen");
    expect(diagCodes("* | sort by (_time) desc")).toEqual([]);
  });

  it("value completion replaces the whole token, not just up to the caret", () => {
    // caret between ER and ROR in level:ERROR
    const result = complete("level:ERROR", 8);
    expect(result.labels).toEqual(["ERROR"]);
    expect([result.from, result.to]).toEqual([6, 11]);
  });

  it("field completion swallows an existing colon", () => {
    // caret between lev and el in level:ERROR
    const result = complete("level:ERROR", 3);
    expect(result.labels).toContain("level:");
    expect([result.from, result.to]).toEqual([0, 6]);
  });

  it("tokens after the caret do not steer pipe argument completion", () => {
    // caret inside _time of a complete sort command
    const source = "level:ERROR | sort by (_time) desc";
    const caret = source.indexOf("_time") + 2;
    const result = complete(source, caret);
    expect(result.labels).toContain("_time");
    expect(result.labels).not.toContain("desc");
  });

  it("all presets parse without diagnostics", () => {
    for (const preset of QUERY_PRESETS) {
      expect(diagCodes(preset.query), preset.id).toEqual([]);
    }
  });
});

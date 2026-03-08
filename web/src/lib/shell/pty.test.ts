import { describe, expect, it } from "vitest";
import {
  getLastToken,
  getSharedFragment,
  hasTailingWhitespace,
  isIncompleteInput,
  slice,
  unicodeStrDisplayLength,
} from "./pty";

describe("unicodeStrDisplayLength", () => {
  it("counts ASCII, wide characters, emoji, and ANSI sequences correctly", () => {
    expect(unicodeStrDisplayLength("abc")).toBe(3);
    expect(unicodeStrDisplayLength("你好")).toBe(4);
    expect(unicodeStrDisplayLength("🙂")).toBe(2);
    expect(unicodeStrDisplayLength("\u001b[31mred\u001b[0m")).toBe(3);
  });
});

describe("slice", () => {
  it("respects display width for wide characters", () => {
    expect(slice("ab你好cd", 2, 6)).toBe("你好");
    expect(slice("你好世界", 0, 4)).toBe("你好");
  });
});

describe("isIncompleteInput", () => {
  it("detects dangling quotes, operators, and trailing escapes", () => {
    expect(isIncompleteInput("echo 'unterminated")).toBe(true);
    expect(isIncompleteInput('echo "unterminated')).toBe(true);
    expect(isIncompleteInput("echo foo &&")).toBe(true);
    expect(isIncompleteInput("echo foo |")).toBe(true);
    expect(isIncompleteInput("echo foo \\")).toBe(true);
    expect(isIncompleteInput("echo foo \\\\")).toBe(false);
    expect(isIncompleteInput("echo done")).toBe(false);
  });
});

describe("completion helpers", () => {
  it("detects unescaped trailing whitespace and suppresses the last token", () => {
    expect(hasTailingWhitespace("echo foo ")).toBe(true);
    expect(hasTailingWhitespace("echo foo\\ ")).toBe(false);
    expect(getLastToken("git checkout feature")).toBe("feature");
    expect(getLastToken("git checkout ")).toBe("");
  });

  it("extends the shared completion fragment across candidates", () => {
    expect(getSharedFragment("fe", ["feature", "feast"])).toBe("fea");
    expect(getSharedFragment("main", ["main", "maint"])).toBe("main");
    expect(getSharedFragment("no", ["feature", "feast"])).toBe("");
  });
});

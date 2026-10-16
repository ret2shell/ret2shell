import { describe, expect, it } from "vitest";

// remark-parse's entity decoder resolves to its DOM build under vitest's
// browser resolve conditions; stub just enough of `document` to let it run
// in the node test environment instead of adding a dom environment package
if (typeof globalThis.document === "undefined") {
  (globalThis as Record<string, unknown>).document = {
    createElement() {
      const el: { firstChild: { data: string } | null; innerHTML_: string } = {
        firstChild: null,
        innerHTML_: "",
      };
      Object.defineProperty(el, "innerHTML", {
        set(value: string) {
          el.firstChild = { data: value };
        },
        get() {
          return el.innerHTML_;
        },
      });
      return el;
    },
  };
}

const { unified } = await import("unified");
const { default: remarkParse } = await import("remark-parse");
const { default: remarkRehype } = await import("remark-rehype");
const { default: rehypeStringify } = await import("rehype-stringify");
const { rehypeMoji } = await import("./moji");
const { MOJI_CATEGORIES, MOJI_BY_CODE, findMoji, singleMojiOf } = await import("../../moji");

async function render(markdown: string) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeMoji)
    .use(rehypeStringify)
    .process(markdown);
  return result.toString();
}

describe("moji data", () => {
  it("exposes every category item in the lookup map", () => {
    const items = MOJI_CATEGORIES.flatMap((c) => c.items);
    for (const item of items) {
      expect(MOJI_BY_CODE.get(item.code)).toBe(item);
      expect(item.icon).toMatch(/^icon-\[fluent-emoji-flat--[a-z0-9-]+\]$/);
    }
  });

  it("has no duplicate codes", () => {
    const items = MOJI_CATEGORIES.flatMap((c) => c.items);
    expect(new Set(items.map((i) => i.code)).size).toBe(items.length);
  });

  it("resolves known codes and rejects unknown ones", () => {
    expect(findMoji("bug")?.icon).toContain("bug");
    expect(findMoji("sparkles")?.icon).toContain("sparkles");
    expect(findMoji("+1")?.icon).toContain("thumbs-up");
    expect(findMoji("not-a-moji")).toBeUndefined();
  });
});

describe("singleMojiOf", () => {
  it("detects a lone shortcode", () => {
    expect(singleMojiOf(":bug:")?.code).toBe("bug");
    expect(singleMojiOf("  :tada:  \n")?.code).toBe("tada");
  });

  it("rejects anything but exactly one known shortcode", () => {
    expect(singleMojiOf(":bug: and text")).toBeUndefined();
    expect(singleMojiOf("text :bug:")).toBeUndefined();
    expect(singleMojiOf(":bug: :fire:")).toBeUndefined();
    expect(singleMojiOf(":unknownmoji:")).toBeUndefined();
    expect(singleMojiOf("")).toBeUndefined();
  });
});

describe("rehypeMoji", () => {
  it("renders known shortcodes as colored icon spans", async () => {
    const html = await render("hello :bug: world");
    expect(html).toContain('class="moji icon-[fluent-emoji-flat--bug]"');
    expect(html).toContain("hello");
    expect(html).toContain("world");
    expect(html).not.toContain(":bug:");
  });

  it("keeps unknown shortcodes as literal text", async () => {
    const html = await render("unknown :notamoji: stays");
    expect(html).toContain(":notamoji:");
    expect(html).not.toContain("moji icon");
  });

  it("renders several shortcodes in one text node", async () => {
    const html = await render(":bug: :fire: :rocket:");
    expect(html).toContain("fluent-emoji-flat--bug");
    expect(html).toContain("fluent-emoji-flat--fire");
    expect(html).toContain("fluent-emoji-flat--rocket");
  });

  it("does not touch shortcodes inside code and pre", async () => {
    const html = await render("`code :bug: here`");
    expect(html).toContain(":bug:");
    expect(html).not.toContain("fluent-emoji-flat--bug");
    const block = await render("```\n:bug:\n```");
    expect(block).toContain(":bug:");
    expect(block).not.toContain("fluent-emoji-flat--bug");
  });

  it("supports gitmoji-style codes with a plus sign", async () => {
    const html = await render("nice :+1:");
    expect(html).toContain("fluent-emoji-flat--thumbs-up");
  });
});

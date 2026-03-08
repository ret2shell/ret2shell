import { describe, expect, it } from "vitest";
import { remarkAlertQuote } from "./alert-quote";

describe("remarkAlertQuote", () => {
  it("converts supported alert blockquotes and preserves the remaining content", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "[!TIP] Helpful title\nBody text" }],
            },
            {
              type: "paragraph",
              children: [{ type: "text", value: "Second paragraph" }],
            },
          ],
        },
      ],
    };

    remarkAlertQuote({ classMap: { TIP: ["alert", "alert-tip"] } })(tree as never);

    const blockquote = tree.children[0] as {
      type: string;
      data?: { hName?: string; hProperties?: Record<string, unknown> };
      children: Array<{ type: string; children: Array<{ type: string; value: string }> }>;
    };

    expect(blockquote.type).toBe("alertBlockquote");
    expect(blockquote.data).toMatchObject({
      hName: "blockquote",
      hProperties: {
        className: ["alert", "alert-tip"],
        dataAlertTitle: "Helpful title",
      },
    });
    expect(blockquote.children[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "Helpful title" }],
    });
    expect(blockquote.children[1].children[0].value).toBe("Body text");
  });

  it("leaves unsupported alert identifiers unchanged", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "[!NOTE] Untouched" }],
            },
          ],
        },
      ],
    };

    remarkAlertQuote({ classMap: { TIP: ["alert", "alert-tip"] } })(tree as never);

    expect(tree.children[0]).toEqual({
      type: "blockquote",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "[!NOTE] Untouched" }],
        },
      ],
    });
  });
});

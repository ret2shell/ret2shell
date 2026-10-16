import type { Root as HastRoot, Text as HastText, Parents } from "hast";
import { visit } from "unist-util-visit";
import { findMoji, MOJI_REGEX } from "../../moji";

/**
 * Rehype plugin rendering `:code:` moji shortcodes as colored
 * `fluent-emoji-flat` icon spans. Must run AFTER `rehype-sanitize`: the
 * generated spans are trusted markup, so they bypass the schema instead of
 * whitelisting arbitrary icon classes.
 *
 * Text inside `code`, `pre` and links' raw content keeps shortcodes verbatim.
 */
export function rehypeMoji() {
  return (tree: HastRoot) => {
    visit(tree, "text", (node: HastText, index: number | undefined, parent: Parents | undefined) => {
      if (index === undefined || parent === undefined) return;
      // skip code contexts where shortcodes should stay literal
      let ancestor: Parents | undefined = parent;
      while (ancestor) {
        const tag = "tagName" in ancestor ? (ancestor.tagName as string) : undefined;
        if (tag === "code" || tag === "pre") return;
        ancestor = ancestor.parent as Parents | undefined;
      }

      MOJI_REGEX.lastIndex = 0;
      if (!MOJI_REGEX.test(node.value)) return;

      MOJI_REGEX.lastIndex = 0;
      const replacement: {
        type: string;
        value?: string;
        children?: unknown[];
        tagName?: string;
        properties?: Record<string, unknown>;
      }[] = [];
      let last = 0;
      for (const match of node.value.matchAll(MOJI_REGEX)) {
        const item = findMoji(match[1]);
        if (!item) continue;
        const start = match.index ?? 0;
        if (start > last) replacement.push({ type: "text", value: node.value.slice(last, start) });
        replacement.push({
          type: "element",
          tagName: "span",
          properties: { className: ["moji", item.icon] },
          children: [],
        });
        last = start + match[0].length;
      }
      if (replacement.length === 0) return;
      if (last < node.value.length) replacement.push({ type: "text", value: node.value.slice(last) });
      parent.children.splice(index, 1, ...replacement);
    });
  };
}

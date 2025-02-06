import { h } from "hastscript";
import type { Root } from "remark-parse/lib";
import { visit } from "unist-util-visit";

interface AlertBlockquoteOptions {
  /**
   * Class map for blockquote.
   * @field { [identifier]: [className] }
   */
  classMap: Record<string, string[]>;
}

export function remarkAlertQuote(options: Readonly<AlertBlockquoteOptions>) {
  return (tree: Root) => {
    visit(tree, "blockquote", (node) => {
      if (node.children && node.children.length > 0) {
        const firstChild = node.children[0];
        if (firstChild.type === "paragraph" && firstChild.children && firstChild.children.length > 0) {
          const textNode = firstChild.children[0];
          if (textNode.type !== "text") return;
          // find the `[!identifier]` phrase at the first line of blockquote
          const _lfpos = textNode.value.indexOf("\n");
          const firstline = _lfpos > 0 ? textNode.value.slice(0, _lfpos) : textNode.value;
          const match = firstline.match(/^\[!(.+)\]\s*(.*)$/im);
          if (!match) return;
          const identifier = match[1];
          // if the identifier is not in the classMap, treat it as normal blockquote
          if (!Object.prototype.hasOwnProperty.call(options.classMap, identifier)) return;
          // strip the identifier
          textNode.value = textNode.value.slice(match[0].length).trimStart();
          if (textNode.value.length === 0) {
            firstChild.children.shift();
          }
          if (firstChild.children.length === 0) {
            node.children.shift();
          }
          // insert the title at the beginning if it declares
          if (match[2].length > 0) {
            (node.children as unknown[]).unshift({
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value: match[2],
                },
              ],
            });
          }
          // set class
          node.type = "alertBlockquote" as (typeof node)["type"];
          const element = h(
            "blockquote",
            Object.assign(
              { className: options.classMap[identifier] },
              match[2].length > 0 ? { dataAlertTitle: match[2] } : {}
            )
          );
          node.data = Object.assign({}, node.data, {
            hName: element.tagName,
            hProperties: element.properties,
          });
        }
      }
    });
  };
}

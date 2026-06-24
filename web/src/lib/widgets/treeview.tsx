import { useSearchParams } from "@solidjs/router";
import clsx from "clsx";
import { createEffect, createSignal, For, type JSX, Show, untrack } from "solid-js";
import Button from "./button";
import Link from "./link";

export type TreeNode = {
  id: string | number;
  children: TreeNode[];
  name: string;
  icon: string;
  extraClasses?: string;
} & (
  | {
      type: "item";
      link?: string;
      extraPart?: JSX.Element;
      belowPart?: JSX.Element;
      searchValue?: string;
      onClick?: () => void;
    }
  | {
      type: "category";
    }
);

export type TreeViewProps = {
  tree: TreeNode[];
  size?: "sm" | "md";
  highlightPaths?: string[];
  activeMatch?: "exact" | "partial";
  activeSearchParams?: string;
};

export default function TreeView(props: TreeViewProps) {
  const [searchParams, _] = useSearchParams();
  const renderNode = (node: TreeNode, level = 0) => {
    const [showChildren, setShowChildren] = createSignal(false);
    createEffect(() => {
      if (props.highlightPaths) {
        untrack(() => {
          if (props.highlightPaths?.at(level) === node.id.toString()) {
            setShowChildren(true);
          }
        });
      }
    });
    return (
      <li>
        <Show
          when={node.type === "category"}
          fallback={
            <Link
              size={props.size}
              justify="start"
              ghost
              title={node.name}
              class={clsx("font-normal w-full overflow-hidden", node.extraClasses)}
              href={node.type === "item" && node.link ? node.link : "#"}
              activeMatch={props.activeMatch}
              active={
                node.type === "item" &&
                !!props.activeSearchParams &&
                searchParams[props.activeSearchParams] === node.searchValue
              }
            >
              <span class={clsx("w-5 h-5", node.icon)} />
              <div class="flex-1 min-w-0 flex flex-col items-start">
                <div class="flex w-full items-center">
                  <span class="flex-1 text-start truncate">{node.name}</span>
                  <Show when={node.type === "item" && node.extraPart}>{node.type === "item" && node.extraPart}</Show>
                </div>
                <Show when={node.type === "item" && node.belowPart}>{node.type === "item" && node.belowPart}</Show>
              </div>
            </Link>
          }
        >
          <Button
            ghost
            title={node.name}
            size={props.size}
            justify="start"
            class={clsx("font-normal w-full overflow-hidden", node.extraClasses)}
            onClick={() => {
              setShowChildren(!showChildren());
            }}
          >
            <span class={clsx("w-5 h-5", node.icon)} />
            <span class="flex-1 text-start truncate">{node.name}</span>
            <span
              class={clsx(
                "icon-[fluent--chevron-right-20-regular] w-5 h-5 transition-transform",
                showChildren() && "rotate-90"
              )}
            />
          </Button>
        </Show>
        <Show when={node.type === "category" && showChildren()}>
          <ul class="mt-2 pl-2 relative before:absolute before:-top-2 before:bottom-0 before:left-2 before:w-px before:bg-layer-content/20 flex flex-col space-y-2">
            <For each={node.children}>{(child) => renderNode(child, level + 1)}</For>
          </ul>
        </Show>
      </li>
    );
  };

  return (
    <ul class="flex flex-col space-y-2">
      <For each={props.tree}>{(node) => renderNode(node)}</For>
    </ul>
  );
}

import { For, type JSX, Show, createEffect, createSignal, untrack } from "solid-js";
import Button from "./button";
import Link from "./link";

export type TreeNode = {
    id: string | number;
    children: TreeNode[];
    name: string;
    icon: string;
} & (
    | {
          type: "item";
          link?: string;
          extraPart?: JSX.Element;
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
};

export default function TreeView(props: TreeViewProps) {
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
                            class="w-full overflow-hidden"
                            href={node.type === "item" && node.link ? node.link : "#"}
                            activeMatch="exact"
                        >
                            <span class={`${node.icon} w-5 h-5`} />
                            <span class="flex-1 text-start truncate">{node.name}</span>
                            <Show when={node.type === "item" && node.extraPart}>
                                {node.type === "item" && node.extraPart}
                            </Show>
                        </Link>
                    }
                >
                    <Button
                        ghost
                        title={node.name}
                        size={props.size}
                        justify="start"
                        class="w-full overflow-hidden"
                        onClick={() => {
                            setShowChildren(!showChildren());
                        }}
                    >
                        <span class={`${node.icon} w-5 h-5`} />
                        <span class="flex-1 text-start truncate">{node.name}</span>
                        <span
                            class={`icon-[fluent--chevron-right-20-regular] w-5 h-5 transition-transform ${
                                showChildren() ? "rotate-90" : "rotate-0"
                            }`}
                        />
                    </Button>
                </Show>
                <Show when={node.type === "category" && showChildren()}>
                    <ul class="mt-2 pl-2 relative before:absolute before:-top-2 before:bottom-0 before:left-2 before:w-[1px] before:bg-layer-content/20 flex flex-col space-y-2">
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

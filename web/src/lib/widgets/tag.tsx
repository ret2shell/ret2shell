import clsx from "clsx";
import { type ComponentProps, type JSX, Show, splitProps } from "solid-js";

export type TagProps = {
  level: "info" | "success" | "warning" | "error" | "layer-content";
  size?: "md" | "sm";
  /** replaces the default colored dot when provided */
  icon?: JSX.Element;
};

export default function Tag(props: { children?: JSX.Element } & TagProps & ComponentProps<"div">) {
  const [tagProps, others] = splitProps(props, ["children", "level", "size", "icon"]);
  return (
    <div {...others} class={clsx("tag", tagProps.size === "sm" && "tag-sm", others.class, others.classList)}>
      <div class="tag-content">
        {/* bg-info bg-success bg-warning bg-error */}
        <Show when={!tagProps.icon}>
          <span class={clsx("tag-dot", `bg-${tagProps.level}`)} />
        </Show>
        {tagProps.icon}
        {tagProps.children}
      </div>
    </div>
  );
}

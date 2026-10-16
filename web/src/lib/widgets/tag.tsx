import clsx from "clsx";
import { type ComponentProps, type JSX, splitProps } from "solid-js";

export type TagProps = {
  level: "info" | "success" | "warning" | "error" | "layer-content";
  size?: "md" | "sm";
};

export default function Tag(props: { children?: JSX.Element } & TagProps & ComponentProps<"div">) {
  const [tagProps, others] = splitProps(props, ["children", "level", "size"]);
  return (
    <div {...others} class={clsx("tag", tagProps.size === "sm" && "tag-sm", others.class, others.classList)}>
      <div class="tag-content">
        {/* bg-info bg-success bg-warning bg-error */}
        <span class={clsx("tag-dot", `bg-${tagProps.level}`)} />
        {tagProps.children}
      </div>
    </div>
  );
}

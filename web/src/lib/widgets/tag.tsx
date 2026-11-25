import type { ComponentProps, JSX } from "@solidjs/web";
import clsx from "clsx";
import { omit } from "solid-js";

export type TagProps = {
  level: "info" | "success" | "warning" | "error" | "layer-content";
};

export default function Tag(props: { children?: JSX.Element } & TagProps & ComponentProps<"div">) {
  const others = omit(props, "children", "level");
  return (
    <div {...others} class={clsx("tag", others.class)}>
      <div class="tag-content">
        {/* bg-info bg-success bg-warning bg-error */}
        <span class={clsx("tag-dot", `bg-${props.level}`)} />
        {props.children}
      </div>
    </div>
  );
}

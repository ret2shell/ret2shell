import type { ComponentProps } from "@solidjs/web";
import clsx from "clsx";
import { omit } from "solid-js";

export interface CardProps {
  solid?: boolean;
  contentClass?: string;
  level?: "info" | "success" | "warning" | "error";
}

export default function (props: CardProps & ComponentProps<"div">) {
  const nativeProps = omit(props, "solid", "contentClass", "level");
  // card-info card-success card-warning card-error
  return (
    <div
      {...nativeProps}
      class={clsx("card", props.solid && "card-solid", props.level && `card-${props.level}`, nativeProps.class)}
    >
      <div class={clsx("card-content", props.contentClass)}>{nativeProps.children}</div>
    </div>
  );
}

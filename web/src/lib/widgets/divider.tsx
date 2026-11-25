import type { ComponentProps } from "@solidjs/web";
import clsx from "clsx";
import { omit } from "solid-js";

export type DividerProps = { direction?: "horizontal" | "vertical" };

export default function (props: ComponentProps<"div"> & DividerProps) {
  const nativeProps = omit(props, "direction");
  const isVertical = props.direction === "vertical";
  // divider-vertical
  return <div {...nativeProps} class={clsx("divider", isVertical && "divider-vertical", nativeProps.class)} />;
}

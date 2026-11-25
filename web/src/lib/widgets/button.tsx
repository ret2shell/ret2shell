import Spin from "@assets/animates/spin";
import type { ComponentProps, JSX } from "@solidjs/web";
import clsx from "clsx";
import { omit, Show } from "solid-js";

export type ButtonProps = ComponentProps<"button"> & {
  active?: boolean;
  level?: "primary" | "info" | "success" | "warning" | "error" | null;
  size?: "sm" | "md";
  ghost?: boolean;
  bold?: boolean;
  justify?: "start" | "center" | "end";
  uppercase?: boolean;
  loading?: boolean;
  square?: boolean;
};

export default function (props: ButtonProps & { children?: JSX.Element }) {
  const nativeProps = omit(
    props,
    "active",
    "level",
    "size",
    "ghost",
    "bold",
    "justify",
    "uppercase",
    "loading",
    "square",
    "children"
  );

  const size = props.size === "sm" ? 16 : 20;

  return (
    <button
      {...nativeProps}
      class={clsx(
        "btn",
        // btn-primary btn-info btn-success btn-warning btn-error
        !!props.level && `btn-${props.level}`,
        // btn-sm btn-md btn-xs
        props.ghost && "btn-ghost",
        props.bold && "btn-bold",
        // justify-start justify-center justify-end
        (props.justify && `justify-${props.justify}`) ?? "justify-center",
        (props.size && `btn-${props.size}`) ?? "btn-md",
        props.uppercase && "uppercase",
        props.square && "btn-square",
        nativeProps.disabled && "btn-disabled",
        nativeProps.class,
        props.active && "btn-active"
      )}
    >
      <Show when={props.loading}>
        <Spin width={size} height={size} />
      </Show>
      {props.children}
    </button>
  );
}

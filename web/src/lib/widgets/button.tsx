import Spin from "@assets/animates/spin";
import clsx from "clsx";
import { type ComponentProps, type JSX, Show, splitProps } from "solid-js";

export type ButtonProps = ComponentProps<"button"> & {
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
  const [buttonProps, _1] = splitProps(props, [
    "level",
    "size",
    "ghost",
    "bold",
    "justify",
    "uppercase",
    "loading",
    "square",
  ]);
  const [children, nativeProps] = splitProps(_1, ["children"]);

  const size = buttonProps.size === "sm" ? 16 : 20;

  return (
    <button
      {...nativeProps}
      class={clsx(
        "btn",
        // btn-primary btn-info btn-success btn-warning btn-error
        !!buttonProps.level && `btn-${buttonProps.level}`,
        // btn-sm btn-md btn-xs
        buttonProps.ghost && "btn-ghost",
        buttonProps.bold && "btn-bold",
        // justify-start justify-center justify-end
        (buttonProps.justify && `justify-${buttonProps.justify}`) ?? "justify-center",
        (buttonProps.size && `btn-${buttonProps.size}`) ?? "btn-md",
        buttonProps.uppercase && "uppercase",
        buttonProps.square && "btn-square",
        nativeProps.disabled && "btn-disabled",
        nativeProps.class,
        nativeProps.classList
      )}
    >
      <Show when={props.loading}>
        <Spin width={size} height={size} />
      </Show>
      {children.children}
    </button>
  );
}

import { Popover } from "@ark-ui/solid";
import { type ComponentProps, type JSX, createSignal, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import type { ButtonProps } from "./button";
import clsx from "clsx";
export default function (
  props: {
    children?: JSX.Element;
    btnContent?: JSX.Element;
    popContentClass?: string;
  } & ButtonProps &
    ComponentProps<"button">
) {
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
  const [popoverProps, nativeProps] = splitProps(_1, ["children", "btnContent", "popContentClass"]);
  const [opened, setOpened] = createSignal(false);

  return (
    <Popover.Root
      autoFocus={false}
      onOpenChange={(detail) => {
        setOpened(detail.open);
      }}
    >
      <Popover.Trigger
        {...nativeProps}
        class={clsx(
          "btn",
          // btn-primary btn-info btn-success btn-warning btn-error
          !!buttonProps.level && `btn-${buttonProps.level}`,
          // btn-sm btn-md
          `btn-${buttonProps.size || "md"}`,
          buttonProps.ghost && !opened() && "btn-ghost",
          buttonProps.bold && "btn-bold",
          // justify-start justify-center justify-end
          `justify-${buttonProps.justify || "center"}`,
          buttonProps.uppercase && "uppercase",
          nativeProps.disabled && "btn-disabled",
          buttonProps.square && "btn-square",
          nativeProps.class,
          nativeProps.classList
        )}
        title={nativeProps.title}
      >
        {props.btnContent}
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content class={clsx("popover", popoverProps.popContentClass)}>
            {popoverProps.children}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

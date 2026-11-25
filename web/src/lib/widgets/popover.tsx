import { Popover, type PopoverRootProps } from "@ark-ui/solid";
import { pick } from "@lib/utils/pick";
import { type ComponentProps, type JSX, Portal } from "@solidjs/web";
import clsx from "clsx";
import { createSignal, omit } from "solid-js";
import type { ButtonProps } from "./button";
export default function (
  props: PopoverRootProps & {
    children?: JSX.Element;
    btnContent?: JSX.Element;
    popContentClass?: string;
  } & ButtonProps &
    ComponentProps<"button">
) {
  const _2 = omit(
    props,
    "level",
    "size",
    "ghost",
    "bold",
    "justify",
    "uppercase",
    "loading",
    "square",
    "closeOnEscape",
    "closeOnInteractOutside",
    "defaultOpen",
    "id",
    "ids",
    "initialFocusEl",
    "lazyMount",
    "modal",
    "onEscapeKeyDown",
    "onExitComplete",
    "onFocusOutside",
    "onInteractOutside",
    "onOpenChange",
    "onPointerDownOutside",
    "open",
    "persistentElements",
    "present",
    "role",
    "unmountOnExit"
  );
  const dialogRootPropsKeys = [
    "level",
    "size",
    "ghost",
    "bold",
    "justify",
    "uppercase",
    "loading",
    "square",
    "children",
    "btnContent",
    "popContentClass",
  ] as const;
  const nativeProps = omit(props, ...dialogRootPropsKeys);
  const dialogRootProps = pick(props, dialogRootPropsKeys);
  const [opened, setOpened] = createSignal(false);

  return (
    <Popover.Root
      {...dialogRootProps}
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
          !!props.level && `btn-${props.level}`,
          // btn-sm btn-md
          `btn-${props.size || "md"}`,
          props.ghost && !opened() && "btn-ghost",
          props.bold && "btn-bold",
          // justify-start justify-center justify-end
          `justify-${props.justify || "center"}`,
          props.uppercase && "uppercase",
          nativeProps.disabled && "btn-disabled",
          props.square && "btn-square",
          nativeProps.class
        )}
        title={nativeProps.title}
      >
        {props.btnContent}
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content class={clsx("popover", props.popContentClass)}>{props.children}</Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

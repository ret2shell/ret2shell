import { Popover, type PopoverRootProps } from "@ark-ui/solid";
import clsx from "clsx";
import { type ComponentProps, createSignal, type JSX, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import type { ButtonProps } from "./button";
export default function (
  props: PopoverRootProps & {
    children?: JSX.Element;
    btnContent?: JSX.Element;
    popContentClass?: string;
    /** render the trigger as a bare icon holder without btn styles */
    bare?: boolean;
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
    "bare",
  ]);
  const [dialogRootProps, _2] = splitProps(_1, [
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
    "unmountOnExit",
  ]);
  const [popoverProps, nativeProps] = splitProps(_1, ["children", "btnContent", "popContentClass"]);
  const [opened, setOpened] = createSignal(false);

  return (
    <Popover.Root
      {...dialogRootProps}
      autoFocus={false}
      onOpenChange={(detail) => {
        setOpened(detail.open);
        // dialogRootProps is spread above, but this handler overrides it —
        // forward to the caller's onOpenChange so controlled usage works
        dialogRootProps.onOpenChange?.(detail);
      }}
    >
      <Popover.Trigger
        {...nativeProps}
        class={clsx(
          buttonProps.bare
            ? // bare icon holder: no btn chrome, only centering + pointer
              "inline-flex items-center justify-center cursor-pointer"
            : [
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
              ],
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

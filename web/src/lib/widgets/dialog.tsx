import { Dialog, type DialogRootProps } from "@ark-ui/solid";
import { fullTheme } from "@storage/theme";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { type ComponentProps, type JSX, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import type { ButtonProps } from "./button";
import clsx from "clsx";

export default function (
  props: DialogRootProps &
    ButtonProps &
    ComponentProps<"button"> & {
      btnContent: JSX.Element;
      children: JSX.Element;
      stretched?: boolean;
    }
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
  const [dialogRootProps, _2] = splitProps(_1, [
    "closeOnEscape",
    "closeOnInteractOutside",
    "defaultOpen",
    "finalFocusEl",
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
    "preventScroll",
    "restoreFocus",
    "role",
    "trapFocus",
    "unmountOnExit",
  ]);
  const [contents, nativeProps] = splitProps(_2, ["btnContent", "children", "stretched"]);
  return (
    <Dialog.Root {...dialogRootProps} lazyMount unmountOnExit>
      <Dialog.Trigger
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
          nativeProps.class
        )}
        title={nativeProps.title}
      >
        {contents.btnContent}
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop class="dialog-backdrop fixed backdrop-blur-sm bg-layer/60 top-0 left-0 w-screen h-screen" />
        <Dialog.Positioner class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center">
          <Dialog.Content
            class={clsx(
              "dialog-content card relative max-h-[calc(100vh-2rem)]",
              contents.stretched && "w-full max-w-5xl mx-4"
            )}
          >
            <OverlayScrollbarsComponent
              options={{
                scrollbars: {
                  theme: `os-theme-${fullTheme()}`,
                  autoHide: "scroll",
                },
              }}
              class="relative w-full max-w-full h-full max-h-[calc(100vh-2rem)] overflow-hidden"
              defer
            >
              <div class="card-content p-3 lg:p-6">{contents.children}</div>
            </OverlayScrollbarsComponent>
            <Dialog.CloseTrigger class="btn btn-sm btn-square flex items-center justify-center btn-ghost absolute right-2 top-2">
              <span class="icon-[fluent--dismiss-20-regular] w-5 h-5" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

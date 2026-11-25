import { Dialog, type DialogRootProps } from "@ark-ui/solid";
import { pick } from "@lib/utils/pick";
import { type ComponentProps, type JSX, Portal } from "@solidjs/web";
import { fullTheme, t } from "@storage/theme";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import clsx from "clsx";
import { omit } from "solid-js";
import type { ButtonProps } from "./button";

export default function (
  props: DialogRootProps &
    ButtonProps &
    ComponentProps<"button"> & {
      btnContent: JSX.Element;
      children: JSX.Element;
      stretched?: boolean;
    }
) {
  const dialogRootPropsKeys = [
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
    "btnContent",
    "children",
    "stretched",
  ] as const;
  const nativeProps = omit(props, ...dialogRootPropsKeys);
  const dialogRootProps = pick(props, dialogRootPropsKeys);
  return (
    <Dialog.Root {...dialogRootProps} lazyMount unmountOnExit>
      <Dialog.Trigger
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
          nativeProps.class
        )}
        title={nativeProps.title}
      >
        {props.btnContent}
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop class="dialog-backdrop fixed backdrop-blur-sm bg-layer/60 top-0 left-0 w-screen h-screen" />
        <Dialog.Positioner class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center">
          <Dialog.Content
            class={clsx(
              "dialog-content card relative max-h-[calc(100vh-2rem)]",
              props.stretched && "w-full max-w-5xl mx-4"
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
              <div class="card-content p-3 lg:p-6">{props.children}</div>
            </OverlayScrollbarsComponent>
            <Dialog.CloseTrigger
              class="btn btn-sm btn-square flex items-center justify-center btn-ghost absolute right-2 top-2"
              title={t("general.actions.close.title")}
            >
              <span class="shrink-0 icon-[fluent--dismiss-20-regular] w-5 h-5" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

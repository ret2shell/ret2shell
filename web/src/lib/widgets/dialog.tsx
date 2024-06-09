import { Dialog, type DialogRootProps } from "@ark-ui/solid";
import { type ComponentProps, type JSX, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import type { ButtonProps } from "./button";

export default function (
    props: DialogRootProps & ButtonProps & ComponentProps<"button"> & { btnContent: JSX.Element; children: JSX.Element }
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
    const [contents, nativeProps] = splitProps(_2, ["btnContent", "children"]);
    const classList = () => {
        return {
            btn: true,
            // btn-primary btn-info btn-success btn-warning btn-error
            [`btn-${buttonProps.level}`]: !!buttonProps.level,
            // btn-sm btn-md
            [`btn-${buttonProps.size || "md"}`]: true,
            "btn-ghost": buttonProps.ghost,
            "btn-bold": buttonProps.bold,
            // justify-start justify-center justify-end
            [`justify-${buttonProps.justify || "center"}`]: true,
            uppercase: buttonProps.uppercase,
            "btn-square": buttonProps.square,
        };
    };
    const mergedClass = () =>
        Object.keys(classList())
            .filter((key) => classList()[key])
            .join(" ");
    return (
        <Dialog.Root {...dialogRootProps} lazyMount unmountOnExit>
            <Dialog.Trigger {...nativeProps} class={`${mergedClass()} ${nativeProps.class}`} title={nativeProps.title}>
                {contents.btnContent}
            </Dialog.Trigger>
            <Portal>
                <Dialog.Backdrop class="fixed backdrop-blur bg-layer/60 top-0 left-0 w-screen h-screen" />
                <Dialog.Positioner class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center">
                    <Dialog.Content class="card">
                        <div class="card-content p-2">{contents.children}</div>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    );
}

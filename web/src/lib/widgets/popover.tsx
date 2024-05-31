import { Popover } from "@ark-ui/solid";
import { type ComponentProps, type JSX, createSignal, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import type { ButtonProps } from "./button";
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

    const classList = () => {
        return {
            btn: true,
            // btn-primary btn-info btn-success btn-warning btn-error
            [`btn-${buttonProps.level}`]: !!buttonProps.level,
            // btn-sm btn-md
            [`btn-${buttonProps.size || "md"}`]: true,
            "btn-ghost": buttonProps.ghost && !opened(),
            "btn-bold": buttonProps.bold,
            // justify-start justify-center justify-end
            [`justify-${buttonProps.justify || "center"}`]: true,
            uppercase: buttonProps.uppercase,
            disabled: nativeProps.disabled,
            "btn-square": buttonProps.square,
        };
    };
    const mergedClass = () =>
        Object.keys(classList())
            .filter((key) => classList()[key])
            .join(" ");
    return (
        <Popover.Root
            autoFocus={false}
            onOpenChange={(detail) => {
                setOpened(detail.open);
            }}
        >
            <Popover.Trigger {...nativeProps} class={`${mergedClass()} ${nativeProps.class}`} title={nativeProps.title}>
                {props.btnContent}
            </Popover.Trigger>
            <Portal>
                <Popover.Positioner>
                    <Popover.Content class={popoverProps.popContentClass}>{popoverProps.children}</Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover.Root>
    );
}

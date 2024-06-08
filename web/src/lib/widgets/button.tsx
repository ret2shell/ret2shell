import Spin from "@assets/animates/spin";
import { type ComponentProps, type JSX, Show, createMemo, splitProps } from "solid-js";

export type ButtonProps = {
    level?: "primary" | "info" | "success" | "warning" | "error" | null;
    size?: "sm" | "md";
    ghost?: boolean;
    bold?: boolean;
    justify?: "start" | "center" | "end";
    uppercase?: boolean;
    loading?: boolean;
    square?: boolean;
};

export default function (props: ComponentProps<"button"> & ButtonProps & { children?: JSX.Element }) {
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
    const classList = createMemo(() => {
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
            "btn-disabled": nativeProps.disabled,
            "btn-square": buttonProps.square,
        };
    });
    const className = createMemo(() => {
        return Object.keys(classList())
            .filter((key) => classList()[key])
            .join(" ");
    });

    const size = buttonProps.size === "sm" ? 16 : 20;

    return (
        <button {...nativeProps} class={`${className()} ${nativeProps.class}`}>
            <Show when={props.loading}>
                <Spin width={size} height={size} />
            </Show>
            {children.children}
        </button>
    );
}

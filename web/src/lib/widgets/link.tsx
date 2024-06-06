import Spin from "@assets/animates/spin";
import { A, useMatch } from "@solidjs/router";
import { type ComponentProps, type JSX, Show, children, createMemo } from "solid-js";
import type { ButtonProps } from "./button";

export type LinkProps = {
    activeMatch?: "exact" | "partial";
    active?: boolean;
    disabled?: boolean;
};

export default function (props: ComponentProps<"a"> & ButtonProps & LinkProps & { children?: JSX.Element }) {
    const match = useMatch(() => (props.activeMatch === "exact" ? props.href! : `${props.href}/*`));
    const classList = createMemo(() => {
        return {
            btn: true,
            // btn-primary btn-info btn-success btn-warning btn-error
            [`btn-${props.level}`]: !!props.level,
            // btn-sm btn-md
            [`btn-${props.size || "md"}`]: true,
            "btn-ghost": props.ghost,
            "btn-bold": props.bold,
            // justify-start justify-center justify-end
            [`justify-${props.justify || "center"}`]: true,
            uppercase: props.uppercase,
            "btn-disabled": props.disabled,
            "btn-square": props.square,
            "btn-active": props.activeMatch ? Boolean(match()) : props.active,
        };
    });
    const className = createMemo(() => {
        return Object.keys(classList())
            .filter((key) => classList()[key])
            .join(" ");
    });
    return (
        <A
            {...props}
            href={props.disabled ? "#" : props.href ?? "#"}
            type={props.type}
            class={`${className()} ${props.class}`}
        >
            <Show when={props.loading}>
                <Spin />
            </Show>
            {children(() => props.children)()}
        </A>
    );
}

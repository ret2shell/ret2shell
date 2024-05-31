import { type ComponentProps, splitProps } from "solid-js";

export type DividerProps = { direction?: "horizontal" | "vertical" };

export default function (props: ComponentProps<"div"> & DividerProps) {
    const [dividerProps, nativeProps] = splitProps(props, ["direction"]);
    const isVertical = dividerProps.direction === "vertical";
    // divider-vertical
    return (
        <div {...nativeProps} class={`divider ${isVertical ? "divider-vertical" : ""} ${nativeProps.class || ""}`} />
    );
}

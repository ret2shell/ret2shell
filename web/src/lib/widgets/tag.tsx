import { type ComponentProps, type JSX, splitProps } from "solid-js";

export type TagProps = {
    level: "info" | "success" | "warning" | "error" | "layer-content";
};

export default function Tag(props: { children?: JSX.Element } & TagProps & ComponentProps<"div">) {
    const [tagProps, others] = splitProps(props, ["children", "level"]);
    return (
        <div {...others} class={`tag ${others.class}`}>
            <div class="tag-content">
                {/* bg-info bg-success bg-warning bg-error */}
                <span class={`tag-dot bg-${tagProps.level}`} />
                {tagProps.children}
            </div>
        </div>
    );
}

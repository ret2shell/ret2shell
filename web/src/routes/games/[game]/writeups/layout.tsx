import SidebarLayout from "@/lib/blocks/sidebar-layout";
import type { JSX } from "solid-js";

export default function (props: { children?: JSX.Element }) {
    return <SidebarLayout leftBar={null}>{props.children}</SidebarLayout>;
}

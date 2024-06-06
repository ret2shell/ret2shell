import SidebarLayout from "@/lib/blocks/sidebar-layout";
import type { JSX } from "solid-js";
import Sidebar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
    return <SidebarLayout leftBar={<Sidebar />}>{props.children}</SidebarLayout>;
}

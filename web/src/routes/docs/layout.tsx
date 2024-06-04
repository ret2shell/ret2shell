import SidebarLayout from "@/lib/blocks/sidebar-layout";
import { Title } from "@/lib/storage/header";
import { t } from "@/lib/storage/theme";
import type { JSX } from "solid-js";
import Sidebar from "./_blocks/sidebar";

export default function (props: { children: JSX.Element }) {
    return (
        <>
            <Title title={`${t("docs.title")} - ${t("platform.name")}`} />
            <SidebarLayout leftBar={<Sidebar />}>{props.children}</SidebarLayout>
        </>
    );
}

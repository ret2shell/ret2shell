import SidebarLayout from "@/lib/blocks/sidebar-layout";
import { gameStore } from "@/lib/storage/game";
import { Title } from "@/lib/storage/header";
import { t } from "@/lib/storage/theme";
import type { JSX } from "solid-js";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
    return (
        <>
            <Title title={`${t("game.admin.title")} - ${gameStore.current?.name || "CTF"}`} />
            <SidebarLayout leftBar={<SideBar />}>{props.children}</SidebarLayout>
        </>
    );
}

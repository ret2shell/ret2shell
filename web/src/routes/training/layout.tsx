import SidebarLayout from "@/lib/blocks/sidebar-layout";
import { setGameStore } from "@/lib/storage/game";
import { Title } from "@/lib/storage/header";
import { platformStore } from "@/lib/storage/platform";
import { t } from "@/lib/storage/theme";
import { type JSX, onCleanup } from "solid-js";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
    onCleanup(() => {
        setGameStore({ current: null, games: [], preload: null });
    });
    return (
        <>
            <Title title={`${t("training.title")} - ${platformStore.config.name || t("platform.name")}`} />
            <SidebarLayout leftBar={<SideBar />}>{props.children}</SidebarLayout>
        </>
    );
}

import SidebarLayout from "@/lib/blocks/sidebar-layout";
import type { Team } from "@/lib/models/team";
import { gameStore } from "@/lib/storage/game";
import { Title } from "@/lib/storage/header";
import { t } from "@/lib/storage/theme";
import { createSignal } from "solid-js";
import Sidebar from "./_blocks/sidebar";

export default function () {
    const [team, setTeam] = createSignal(null as Team | null);
    return (
        <>
            <Title title={`${team()?.name ?? t("game.team.title")} - ${gameStore.current?.name ?? "CTF"}`} />
            <SidebarLayout leftBar={<Sidebar />}>{null}</SidebarLayout>
        </>
    );
}

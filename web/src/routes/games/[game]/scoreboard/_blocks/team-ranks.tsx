import Spin from "@/lib/assets/animates/spin";
import type { Team } from "@/lib/models/team";
import { gameStore } from "@/lib/storage/game";
import { t } from "@/lib/storage/theme";
import { randomTips } from "@/lib/utils/loading-tips";
import Pagination from "@/lib/widgets/pagination";
import { A } from "@solidjs/router";
import { For, Match, Show, Switch } from "solid-js";

// icon-[fluent-emoji-flat--1st-place-medal]
// icon-[fluent-emoji-flat--2nd-place-medal]
// icon-[fluent-emoji-flat--3rd-place-medal]
// icon-[fluent-emoji-flat--sports-medal]

export default function TeamRanks(props: {
    teams: Team[];
    page: number;
    pageSize: number;
    showTime?: boolean;
    loading?: boolean;
    onPageChange?: (page: number) => void;
}) {
    function realIndex(index: number) {
        return index + (props.page - 1) * props.pageSize + 1;
    }
    return (
        <>
            <ul class="flex-1 flex flex-col space-y-2 w-full max-w-5xl self-center">
                <Switch>
                    <Match when={props.loading}>
                        <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                            <Spin width={32} height={32} />
                            <span>{randomTips()}</span>
                        </div>
                    </Match>
                    <Match when={props.teams.length === 0}>
                        <div class="flex-1 flex flex-col space-y-6 items-center justify-center opacity-60">
                            <span class="icon-[fluent--data-trending-48-regular] w-12 h-12" />
                            <span>{t("game.team.noTeamParticipated")}</span>
                        </div>
                    </Match>
                </Switch>
                <For each={props.teams}>
                    {(team, index) => (
                        <li class="h-12 flex flex-row items-center space-x-2 px-4 border-b border-b-layer-content/10">
                            <span class="w-12 text-center">
                                <Switch>
                                    <Match when={realIndex(index()) === 1}>
                                        <span class="icon-[fluent-emoji-flat--1st-place-medal] w-6 h-6" />
                                    </Match>
                                    <Match when={realIndex(index()) === 2}>
                                        <span class="icon-[fluent-emoji-flat--2nd-place-medal] w-6 h-6" />
                                    </Match>
                                    <Match when={realIndex(index()) === 3}>
                                        <span class="icon-[fluent-emoji-flat--3rd-place-medal] w-6 h-6" />
                                    </Match>
                                    <Match when={realIndex(index()) > 3}>
                                        <span class="font-bold opacity-60">
                                            {realIndex(index()).toString().padStart(4, "0")}
                                        </span>
                                    </Match>
                                </Switch>
                            </span>
                            <A
                                class="font-bold hover:underline flex-1 truncate"
                                href={`/games/${gameStore.current?.id}/teams/${team.id}`}
                            >
                                {team.name}
                            </A>
                            <span class="w-20 text-end">
                                <span>{team.score}</span>
                                <span class="opacity-60">&nbsp;pts</span>
                            </span>
                            <Show when={props.showTime}>
                                <span class="w-56 text-end font-bold opacity-40 hidden xl:inline-block">
                                    <span>{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                                </span>
                            </Show>
                        </li>
                    )}
                </For>
            </ul>
            <Pagination
                class="pt-6"
                count={props.page * props.pageSize}
                pageSize={props.pageSize}
                page={props.page}
                onPageChange={(e) => props.onPageChange?.(e.page)}
            />
        </>
    );
}

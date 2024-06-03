import { getGames } from "@/lib/api/game";
import { type Game, HostType } from "@/lib/models/game";
import { Permission } from "@/lib/models/user";
import { accountStore } from "@/lib/storage/account";
import { fullTheme, t } from "@/lib/storage/theme";
import { addToast } from "@/lib/storage/toast";
import Button from "@/lib/widgets/button";
import Divider from "@/lib/widgets/divider";
import Link from "@/lib/widgets/link";
import type { HTTPError } from "ky";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createEffect, createSignal, untrack } from "solid-js";

export default function Playgrounds() {
    const [playgrounds, setPlaygrounds] = createSignal([] as Game[]);
    const [loadingPlaygrounds, setLoadingPlaygrounds] = createSignal(false);
    const [playgroundPage, setPlaygroundPage] = createSignal(1);
    const pageSize = 6;
    const [playgroundTotal, setPlaygroundTotal] = createSignal(1);
    const [games, setGames] = createSignal([] as Game[]);
    const [loadingGames, setLoadingGames] = createSignal(false);
    const [gamePage, setGamePage] = createSignal(1);
    const [gameTotal, setGameTotal] = createSignal(1);

    function fetchPlaygrounds() {
        setLoadingPlaygrounds(true);
        getGames(playgroundPage(), pageSize, HostType.CTFTraining)
            .then((resp) => {
                setPlaygrounds(resp[0]);
                setPlaygroundTotal(resp[1]);
            })
            .catch((err: HTTPError) => {
                void err.response.text().then((text) => {
                    addToast({
                        level: "error",
                        description: `${t("training.failedToFetchPlaygrounds")}: ${text}`,
                        duration: 5000,
                    });
                });
            })
            .finally(() => {
                setLoadingPlaygrounds(false);
            });
    }

    function fetchGames() {
        setLoadingGames(true);
        getGames(gamePage(), pageSize, HostType.CTFGame)
            .then((resp) => {
                setGames(resp[0]);
                setGameTotal(resp[1]);
            })
            .catch((err: HTTPError) => {
                void err.response.text().then((text) => {
                    addToast({
                        level: "error",
                        description: `${t("training.failedToFetchGames")}: ${text}`,
                        duration: 5000,
                    });
                });
            })
            .finally(() => {
                setLoadingGames(false);
            });
    }
    createEffect(() => {
        if (playgroundPage()) untrack(fetchPlaygrounds);
    });
    createEffect(() => {
        if (gamePage()) untrack(fetchGames);
    });

    return (
        <div class="flex-1 overflow-hidden">
            <OverlayScrollbarsComponent
                options={{
                    scrollbars: {
                        theme: `os-theme-${fullTheme()}`,
                        autoHide: "scroll",
                    },
                }}
                class="relative w-full h-full print:h-auto print:overflow-auto"
                defer
            >
                <div class="flex flex-col space-y-2 p-3 lg:p-6">
                    <Show when={accountStore.permissions.includes(Permission.Host)}>
                        <Link level="primary" title={t("form.create")} href={"/training?create=true"}>
                            <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                            <span>{t("form.create")}</span>
                        </Link>
                        <Divider class="!mt-3 lg:!mt-6" />
                    </Show>
                    <div class="flex flex-row space-x-2">
                        <Button ghost disabled justify="start" class="flex-1" size="sm">
                            <span>{t("training.title")}</span>
                        </Button>
                        <Button
                            square
                            ghost
                            size="sm"
                            disabled={playgroundPage() <= 1}
                            onClick={() => setPlaygroundPage(playgroundPage() - 1)}
                        >
                            <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
                        </Button>
                        <Button ghost size="sm" class="min-w-8" loading={loadingPlaygrounds()}>
                            <Show when={!loadingPlaygrounds()}>
                                <span>{playgroundPage()}</span>
                            </Show>
                        </Button>
                        <Button
                            square
                            ghost
                            size="sm"
                            disabled={playgroundPage() >= playgroundTotal()}
                            onClick={() => setPlaygroundPage(playgroundPage() + 1)}
                        >
                            <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                        </Button>
                    </div>
                    <For
                        each={playgrounds()}
                        fallback={
                            <Button ghost disabled>
                                <span class="icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5" />
                                <span>{t("training.noPlaygrounds")}</span>
                            </Button>
                        }
                    >
                        {(item) => (
                            <Link ghost href={`/training/${item.id}`} activeMatch="partial" justify="start">
                                <span class="icon-[fluent--dumbbell-20-regular] w-5 h-5" />
                                <span class="flex-1 text-start">{item.name}</span>
                                <div class="w-2 h-2 rounded-full bg-info" />
                            </Link>
                        )}
                    </For>
                    <Divider class="!mt-6" />
                    <div class="flex flex-row space-x-2">
                        <Button ghost disabled justify="start" size="sm" class="flex-1">
                            <span>{t("game.title")}</span>
                        </Button>
                        <Button
                            square
                            ghost
                            size="sm"
                            disabled={gamePage() <= 1}
                            onClick={() => setGamePage(gamePage() - 1)}
                        >
                            <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
                        </Button>
                        <Button ghost size="sm" class="min-w-8" loading={loadingGames()}>
                            <Show when={!loadingGames()}>
                                <span>{gamePage()}</span>
                            </Show>
                        </Button>
                        <Button
                            square
                            ghost
                            size="sm"
                            disabled={gamePage() >= gameTotal()}
                            onClick={() => setGamePage(gamePage() + 1)}
                        >
                            <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                        </Button>
                    </div>
                    <For
                        each={games()}
                        fallback={
                            <Button ghost disabled>
                                <span class="icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5" />
                                <span>{t("training.noArchivedGames")}</span>
                            </Button>
                        }
                    >
                        {(item) => (
                            <Link
                                ghost
                                href={`/training/${item.id}`}
                                activeMatch="partial"
                                justify="start"
                                disabled={item.archive_at > DateTime.now()}
                                title={item.archive_at > DateTime.now() ? t("training.gameNotArchived") : undefined}
                            >
                                <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
                                <span class="flex-1 text-start">{item.name}</span>
                                <div
                                    class={`w-2 h-2 rounded-full ${
                                        item.archive_at > DateTime.now() ? "bg-error" : "bg-success"
                                    }`}
                                />
                            </Link>
                        )}
                    </For>
                </div>
            </OverlayScrollbarsComponent>
        </div>
    );
}

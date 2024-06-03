import { getGameScoreboard } from "@/lib/api/game";
import type { Team } from "@/lib/models/team";
import { accountStore, refreshInstitutes } from "@/lib/storage/account";
import { gameStore } from "@/lib/storage/game";
import { Title } from "@/lib/storage/header";
import { t } from "@/lib/storage/theme";
import { addToast } from "@/lib/storage/toast";
import Button from "@/lib/widgets/button";
import Card from "@/lib/widgets/card";
import Chart from "@/lib/widgets/chart";
import Select from "@/lib/widgets/select";
import { type Size, createElementSize } from "@solid-primitives/resize-observer";
import { useSearchParams } from "@solidjs/router";
import type { HTTPError } from "ky";
import { Match, Show, Switch, createEffect, createMemo, createSignal, onMount, untrack } from "solid-js";
import TeamDetails from "./_blocks/team-details";
import TeamRanks from "./_blocks/team-ranks";
import TeamSolves from "./_blocks/team-solves";

function ChartOperations(props: {
    onRefresh?: () => void;
    onExport?: () => void;
    onInstituteChanged?: (institute: number | null) => void;
    size?: "md" | "sm";
    ghost?: boolean;
    showHiddenTeams?: boolean;
    onShowHiddenTeams?: (show: boolean) => void;
    institute?: number | null;
}) {
    const gameInstitutes = createMemo(() => {
        return accountStore.institutes.filter((i) => gameStore.current?.access_policy.institutes.includes(i.id));
    });
    const gameInstitutesSelect = createMemo(() => {
        return gameInstitutes().map((i) => ({
            value: i.id.toString(),
            label: i.name,
            icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
        }));
    });
    return (
        <div class="flex flex-row space-x-2 justify-between overflow-hidden">
            <div class="flex flex-row space-x-2">
                <Button square size={props.size} ghost={props.ghost} onClick={() => props.onRefresh?.()}>
                    <span class="icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />
                </Button>
                <Button square size={props.size} ghost={props.ghost} onClick={() => props.onExport?.()}>
                    <span class="icon-[fluent--open-20-regular] w-5 h-5" />
                </Button>
                <Button
                    square
                    size={props.size}
                    ghost={props.ghost}
                    onClick={() => props.onShowHiddenTeams?.(!props.showHiddenTeams)}
                >
                    <Show
                        when={props.showHiddenTeams}
                        fallback={<span class="icon-[fluent--eye-20-regular] w-5 h-5" />}
                    >
                        <span class="icon-[fluent--eye-off-20-filled] w-5 h-5 text-warning" />
                    </Show>
                </Button>
            </div>
            <Select
                class="flex-1 max-w-64 min-w-0"
                size={props.size}
                ghost={props.ghost}
                placeholder={t("game.scoreboard.selectInstitute")}
                items={gameInstitutesSelect()}
                onValueChange={(v) => {
                    props.onInstituteChanged?.((v.value.at(0) && Number.parseInt(v.value.at(0)!)) || null);
                }}
                value={(props.institute && [props.institute.toString()]) || undefined}
            />
        </div>
    );
}

export default function () {
    const [showLargePanel, setShowLargePanel] = createSignal(false);
    const [showChallengeDetail, setShowChallengeDetail] = createSignal(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const [teams, setTeams] = createSignal<Team[]>([]);
    const [topTeams, setTopTeams] = createSignal<Team[]>([]);
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);
    const showHiddenTeams = createMemo(() => searchParams.hidden === "true");
    const selectedInstituteId = createMemo(() => Number.parseInt(searchParams.institute || "NaN") || null);
    const [loadingInstitute, setLoadingInstitute] = createSignal(true);
    const [loading, setLoading] = createSignal(false);
    const [showPlane, setShowPlane] = createSignal(false);
    void refreshInstitutes().then(() => setLoadingInstitute(false));

    function getTopTeams() {
        setLoading(true);
        getGameScoreboard(gameStore.current?.id || 0, 1, 10, showHiddenTeams(), selectedInstituteId() || undefined)
            .then((data) => {
                setTopTeams(data[0]);
            })
            .catch((err: HTTPError) => {
                void err.response.text().then((text: string) => {
                    addToast({
                        level: "error",
                        description: `${t("game.scoreboard.fetchError")}: ${text}`,
                        duration: 5000,
                    });
                });
            })
            .finally(() => setLoading(false));
    }

    function getTeams() {
        setLoading(true);
        setTeams([]);
        getGameScoreboard(
            gameStore.current?.id || 0,
            page(),
            pageSize(),
            showHiddenTeams(),
            selectedInstituteId() || undefined
        )
            .then((data) => {
                setTeams(data[0]);
            })
            .catch((err: HTTPError) => {
                void err.response.text().then((text: string) => {
                    addToast({
                        level: "error",
                        description: `${t("game.scoreboard.fetchError")}: ${text}`,
                        duration: 5000,
                    });
                });
            })
            .finally(() => setLoading(false));
    }

    createEffect(() => {
        if (gameStore.current?.id) {
            if (showHiddenTeams() || selectedInstituteId()) {
                /// ... just monitor the changes
            }
            untrack(getTopTeams);
            untrack(getTeams);
        }
    });

    createEffect(() => {
        if (page() && pageSize() && gameStore.current?.id) {
            untrack(getTeams);
        }
    });
    // TODO: fetch scoreboard, change scoreboard page.

    let autoPageSizeWatcher: HTMLDivElement;
    let pageHeight: Readonly<Size>;

    const teamChartSeries = () => {
        return teams().map((t) => ({
            name: t.name,
            type: "line",
            step: "end",
            data: t.history.map((h) => [h.changed_at.toMillis(), h.score]),
        }));
    };

    onMount(() => {
        pageHeight = createElementSize(autoPageSizeWatcher);
    });

    createEffect(() => {
        const p = Math.floor(pageHeight.height / 56);
        setPageSize(p);
    });

    return (
        <>
            <Title title={`${t("game.scoreboard.title")} - ${gameStore.current?.name || "CTF"}`} />
            <div class="flex flex-col xl:flex-row flex-1 min-w-min">
                <div ref={autoPageSizeWatcher!} class="fixed h-[calc(100vh-24rem)]" />
                <Show when={!loadingInstitute() && topTeams().length > 0}>
                    <div
                        class={`xl:sticky w-full top-0 left-0 ${
                            showChallengeDetail()
                                ? "xl:w-[20vw] backdrop-blur border-r border-r-layer-content/10"
                                : showLargePanel()
                                  ? "xl:w-[75vw] justify-center"
                                  : "xl:w-[40vw]"
                        } transition-size duration-500 p-3 lg:p-6 flex flex-col space-y-2 flex-shrink-0`}
                    >
                        <Card class="relative" contentClass={`p-2 ${showChallengeDetail() ? "h-48" : "aspect-video"}`}>
                            <Chart
                                option={{
                                    grid: {
                                        left: showChallengeDetail() ? "0" : "72px",
                                        right: showChallengeDetail() ? "4px" : "24px",
                                        bottom: showChallengeDetail() ? "56px" : "80px",
                                        top: showChallengeDetail() ? "4px" : "48px",
                                    },
                                    tooltip: {
                                        trigger: "axis",
                                        axisPointer: {
                                            type: "line",
                                            label: {
                                                precision: 0,
                                            },
                                            snap: true,
                                        },
                                        borderColor: "transparent",
                                    },
                                    dataZoom: [
                                        {
                                            type: "slider",
                                            filterMode: "none",
                                            show: !showChallengeDetail() && topTeams().length > 0,
                                        },
                                    ],
                                    toolbox: {},
                                    xAxis: {
                                        type: "time",
                                    },
                                    yAxis: {
                                        type: "value",
                                        min: () => 0,
                                        max: (value: { min: number; max: number }) => {
                                            if (value.max < 100) return 100;
                                            return Math.ceil(value.max + value.max * 0.1);
                                        },
                                        axisLabel: {
                                            fontFamily: "JetBrains Mono",
                                        },
                                    },
                                    series: teamChartSeries(),
                                }}
                            />
                            <Show when={teams().length === 0}>
                                <div class="absolute top-0 left-0 w-full h-full flex flex-col space-y-6 items-center justify-center">
                                    <span class="icon-[fluent--data-trending-48-regular] w-12 h-12 opacity-60" />
                                </div>
                            </Show>
                            <div class="absolute left-2 top-2 flex flex-row space-x-2">
                                <Show when={!showChallengeDetail()}>
                                    <Button
                                        ghost
                                        square
                                        level="info"
                                        onClick={() => setShowLargePanel(!showLargePanel())}
                                        class="hidden xl:flex"
                                        size={showChallengeDetail() ? "sm" : "md"}
                                    >
                                        <Show
                                            when={showLargePanel()}
                                            fallback={<span class="icon-[fluent--arrow-expand-20-regular] w-5 h-5" />}
                                        >
                                            <span class="icon-[fluent--arrow-minimize-20-regular] w-5 h-5" />
                                        </Show>
                                    </Button>
                                    <Button
                                        ghost
                                        square
                                        level="info"
                                        onClick={() => setShowPlane(!showPlane())}
                                        class="hidden xl:flex"
                                        size={showChallengeDetail() ? "sm" : "md"}
                                    >
                                        <Show
                                            when={showPlane()}
                                            fallback={<span class="icon-[fluent--airplane-20-regular] w-5 h-5" />}
                                        >
                                            <span class="icon-[fluent--airplane-20-filled] w-5 h-5" />
                                        </Show>
                                    </Button>
                                </Show>
                                <Button
                                    ghost
                                    square
                                    level="info"
                                    size={showChallengeDetail() ? "sm" : "md"}
                                    onClick={() => setShowChallengeDetail(!showChallengeDetail())}
                                    class="hidden xl:flex"
                                >
                                    <Show
                                        when={showChallengeDetail()}
                                        fallback={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                                    >
                                        <span class="icon-[fluent--flag-20-filled] w-5 h-5" />
                                    </Show>
                                </Button>
                            </div>
                            <Show when={showChallengeDetail()}>
                                <div class="absolute bottom-2 left-2 right-2">
                                    <ChartOperations
                                        size="sm"
                                        ghost
                                        showHiddenTeams={showHiddenTeams()}
                                        onShowHiddenTeams={(e) => setSearchParams({ hidden: e ? "true" : null })}
                                        onInstituteChanged={(e) => setSearchParams({ institute: e })}
                                        institute={selectedInstituteId()}
                                    />
                                </div>
                            </Show>
                        </Card>
                        <Show when={!showChallengeDetail()}>
                            <ChartOperations
                                size="md"
                                showHiddenTeams={showHiddenTeams()}
                                onShowHiddenTeams={(e) => setSearchParams({ hidden: e ? "true" : null })}
                                onInstituteChanged={(e) => setSearchParams({ institute: e })}
                                institute={selectedInstituteId()}
                            />
                        </Show>
                        <Switch>
                            <Match when={!showChallengeDetail() && !showLargePanel()}>
                                <TeamDetails topTeams={topTeams().slice(0, 3)} challenges={[]} />
                            </Match>
                            <Match when={showChallengeDetail()}>
                                <TeamRanks teams={teams()} page={page()} pageSize={pageSize()} />
                            </Match>
                        </Switch>
                    </div>
                </Show>
                <div class="flex-1 min-w-fit p-3 lg:p-6 space-y-2 flex flex-col">
                    <Show
                        when={showChallengeDetail()}
                        fallback={
                            <>
                                <h1 class="text-3xl font-bold py-6 text-center hidden xl:inline-block">
                                    {t("game.scoreboard.title")}
                                </h1>
                                <TeamRanks
                                    teams={teams()}
                                    page={page()}
                                    pageSize={pageSize()}
                                    showTime={!showLargePanel()}
                                    loading={loading()}
                                    onPageChange={(p) => setPage(p)}
                                />
                            </>
                        }
                    >
                        <TeamSolves teams={teams()} challenges={[]} />
                    </Show>
                </div>
            </div>
        </>
    );
}

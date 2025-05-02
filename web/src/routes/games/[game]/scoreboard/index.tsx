import { handleHttpError } from "@api";
import { getGameScoreboard } from "@api/game";
import type { Team } from "@models/team";
import { createBreakpoints } from "@solid-primitives/media";
import { type Size, createElementSize } from "@solid-primitives/resize-observer";
import { useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { challengeStore, refreshChallenges } from "@storage/challenge";
import { canAccessChallenges, gameStore, inArchived } from "@storage/game";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Chart from "@widgets/chart";
import Select from "@widgets/select";
import clsx from "clsx";
import { DateTime } from "luxon";
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

  const breakpoints = {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  };
  const matches = createBreakpoints(breakpoints);

  return (
    <div class="flex flex-row space-x-2 justify-between overflow-hidden">
      <div class="flex flex-row space-x-2">
        <Button
          square
          class={props.size === "md" ? (matches.lg ? "btn-md" : "btn-sm") : "btn-sm"}
          ghost={props.ghost}
          onClick={() => props.onRefresh?.()}
        >
          <span class="icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />
        </Button>
        <Button
          square
          class={props.size === "md" ? (matches.lg ? "btn-md" : "btn-sm") : "btn-sm"}
          ghost={props.ghost}
          onClick={() => props.onExport?.()}
        >
          <span class="icon-[fluent--open-20-regular] w-5 h-5" />
        </Button>
        <Button
          square
          class={props.size === "md" ? (matches.lg ? "btn-md" : "btn-sm") : "btn-sm"}
          ghost={props.ghost}
          onClick={() => props.onShowHiddenTeams?.(!props.showHiddenTeams)}
        >
          <Show when={props.showHiddenTeams} fallback={<span class="icon-[fluent--eye-20-regular] w-5 h-5" />}>
            <span class="icon-[fluent--eye-off-20-filled] w-5 h-5 text-warning" />
          </Show>
        </Button>
      </div>
      <Select
        class="flex-1 max-w-64 min-w-0 w-0"
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
  const [total, setTotal] = createSignal(0);
  const [topTeams, setTopTeams] = createSignal<Team[]>([]);
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(null as number | null);
  const showHiddenTeams = createMemo(() => searchParams.hidden === "true");
  const selectedInstituteId = createMemo(() => Number.parseInt((searchParams.institute as string) || "NaN") || null);
  const [loading, setLoading] = createSignal(false);
  const [showPlane, setShowPlane] = createSignal(false);
  const matches = createBreakpoints(breakpoints);

  onMount(async () => {
    pageHeight = createElementSize(autoPageSizeWatcher!);
  });
  async function getTopTeams() {
    setLoading(true);
    try {
      setTopTeams(
        (
          await getGameScoreboard(
            gameStore.current?.id || 0,
            1,
            10,
            showHiddenTeams(),
            selectedInstituteId() || undefined
          )
        )[0]
      );
    } catch (err) {
      handleHttpError(err as Error, t("game.scoreboard.errors.fetchScoreboard.title")!);
    }
    setLoading(false);
  }

  async function getTeams() {
    if (!page() || !pageSize() || !gameStore.current?.id) return;
    setLoading(true);
    setTeams([]);
    try {
      const data = await getGameScoreboard(
        gameStore.current?.id || 0,
        page(),
        pageSize()!,
        showHiddenTeams(),
        selectedInstituteId() || undefined
      );
      setTeams(data[0]);
      setTotal(data[1]);
    } catch (err) {
      handleHttpError(err as Error, t("game.scoreboard.errors.fetchScoreboard.title")!);
    }
    setLoading(false);
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
    if (canAccessChallenges()[0] && challengeStore.challenges.length === 0) {
      untrack(refreshChallenges);
    }
  });

  createEffect(() => {
    if (page() && pageSize() && gameStore.current?.id) {
      untrack(getTeams);
    }
  });

  let autoPageSizeWatcher: HTMLDivElement;
  let pageHeight: Readonly<Size>;

  const teamChartSeries = () => {
    return topTeams().map((t) => ({
      name: t.name,
      type: "line",
      step: "end",
      data: [[gameStore.current?.start_at.toMillis() ?? Date.now(), 0]]
        .concat(
          t.history
            .filter((h) => {
              if (gameStore.current && gameStore.current.start_at < DateTime.now()) {
                return h.changed_at > gameStore.current?.start_at && h.changed_at < gameStore.current?.end_at;
              }
              return true;
            })
            .map((h) => [h.changed_at.toMillis(), h.score])
        )
        .concat([[Math.min(Date.now(), gameStore.current?.end_at.toMillis() ?? Date.now()), t.score]]),
    }));
  };

  createEffect(() => {
    if (pageHeight?.height) {
      const p = Math.floor(pageHeight.height / 48);
      untrack(() => {
        setTimeout(() => {
          setPageSize(p);
        }, 300);
      });
    }
  });

  createEffect(() => {
    if (gameStore.current) {
      untrack(async () => {
        if (challengeStore.challenges.length === 0 && canAccessChallenges()[0]) {
          await refreshChallenges();
        }
      });
    }
  });

  return (
    <>
      <Title page={t("game.scoreboard.title")} route={`/games/${gameStore.current?.id}/scoreboard`} />
      <div class="flex flex-col lg:flex-row flex-1 min-w-min">
        <div ref={autoPageSizeWatcher!} class="fixed h-[calc(100vh-24rem)]" />
        <Show when={topTeams().length > 0}>
          <div
            class={clsx(
              "lg:sticky w-full top-0 left-0",
              showChallengeDetail()
                ? "lg:w-[30vw] lg:max-w-[400px] backdrop-blur-sm border-r border-r-layer-content/10"
                : showLargePanel()
                  ? "lg:w-[75vw] justify-center"
                  : "lg:w-[40vw]",
              "transition-[height,width] duration-500 p-3 lg:p-6 flex flex-col space-y-2 shrink-0"
            )}
          >
            <Card class="relative" contentClass={clsx("p-2", showChallengeDetail() ? "h-48" : "aspect-video")}>
              <Chart
                option={{
                  grid: {
                    left: showChallengeDetail() || !matches.lg ? "0" : "72px",
                    right: showChallengeDetail() || !matches.lg ? "4px" : "24px",
                    bottom: showChallengeDetail() || !matches.lg ? "56px" : "80px",
                    top: showChallengeDetail() || !matches.lg ? "4px" : "48px",
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
                    class="hidden lg:flex"
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
                    class="hidden lg:flex"
                    size={showChallengeDetail() ? "sm" : "md"}
                  >
                    <Show when={showPlane()} fallback={<span class="icon-[fluent--airplane-20-regular] w-5 h-5" />}>
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
                  class="hidden lg:flex"
                  disabled={!canAccessChallenges()[0] && !inArchived()}
                >
                  <Show when={showChallengeDetail()} fallback={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}>
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
                <TeamDetails topTeams={topTeams().slice(0, 3)} challenges={challengeStore.challenges} />
              </Match>
              <Match when={showChallengeDetail()}>
                <TeamRanks
                  teams={teams()}
                  page={page()}
                  pageSize={pageSize()!}
                  total={total()}
                  showTime={false}
                  loading={loading()}
                  onPageChange={(p) => setPage(p)}
                />
              </Match>
            </Switch>
          </div>
        </Show>
        <div class="flex-1 min-w-fit p-3 lg:p-6 flex flex-col">
          <Show
            when={showChallengeDetail()}
            fallback={
              <>
                <h1 class="text-3xl font-bold py-6 text-center hidden lg:inline-block">{t("game.scoreboard.title")}</h1>
                <TeamRanks
                  teams={teams()}
                  page={page()}
                  pageSize={pageSize()!}
                  showTime={!showLargePanel()}
                  loading={loading()}
                  onPageChange={(p) => setPage(p)}
                  total={total()}
                />
              </>
            }
          >
            <TeamSolves teams={teams()} challenges={challengeStore.challenges} />
          </Show>
        </div>
      </div>
    </>
  );
}

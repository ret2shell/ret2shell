import { useInstitutes } from "@api/account";
import { useChallenges } from "@api/challenge";
import { useGame, useGameScoreboard } from "@api/game";
import { useSelfTeam, useTeamRank } from "@api/team";
import type { Team } from "@models/team";
import { createBreakpoints } from "@solid-primitives/media";
import { createElementSize, type Size } from "@solid-primitives/resize-observer";
import { useParams, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { isAdminOfGame, isGameInArchived, isPlayerCanAccessChallenges } from "@storage/game";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Button from "@widgets/button";
import Chart from "@widgets/chart";
import Select from "@widgets/select";
import clsx from "clsx";
import { DateTime } from "luxon";
import { createEffect, createMemo, createSignal, Match, onMount, Show, Switch, untrack } from "solid-js";
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
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game || "0", 10) || 0);
  const game = useGame({ id: () => gameId(), enabled: () => gameId() > 0 });
  const institutes = useInstitutes();
  const gameInstitutes = createMemo(
    () => institutes.data?.filter((i) => (game.data?.access_policy.institutes ?? []).includes(i.id)) || []
  );
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
          <span class="shrink-0 icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />
        </Button>
        <Button
          square
          class={props.size === "md" ? (matches.lg ? "btn-md" : "btn-sm") : "btn-sm"}
          ghost={props.ghost}
          onClick={() => props.onExport?.()}
        >
          <span class="shrink-0 icon-[fluent--open-20-regular] w-5 h-5" />
        </Button>
        <Button
          square
          class={props.size === "md" ? (matches.lg ? "btn-md" : "btn-sm") : "btn-sm"}
          ghost={props.ghost}
          onClick={() => props.onShowHiddenTeams?.(!props.showHiddenTeams)}
        >
          <Show when={props.showHiddenTeams} fallback={<span class="shrink-0 icon-[fluent--eye-20-regular] w-5 h-5" />}>
            <span class="shrink-0 icon-[fluent--eye-off-20-filled] w-5 h-5 text-warning" />
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
          props.onInstituteChanged?.((v.value.at(0) && Number.parseInt(v.value.at(0)!, 10)) || null);
        }}
        value={(props.institute && [props.institute.toString()]) || undefined}
      />
    </div>
  );
}

export default function () {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game || "0", 10) || 0);

  const [showLargePanel, setShowLargePanel] = createSignal(false);
  const [showChallengeDetail, setShowChallengeDetail] = createSignal(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(null as number | null);
  const showHiddenTeams = createMemo(() => searchParams.hidden === "true");
  const selectedInstituteId = createMemo(
    () => Number.parseInt((searchParams.institute as string) || "NaN", 10) || null
  );
  const [showPlane, setShowPlane] = createSignal(false);
  // const [showReal, setShowReal] = createSignal(!canAccessChallenges()[0]);
  const [showReal, setShowReal] = createSignal(true);
  const matches = createBreakpoints(breakpoints);

  const game = useGame({
    id: () => gameId(),
    enabled: () => gameId() > 0,
  });

  const institutes = useInstitutes();

  const selfTeam = useSelfTeam({
    game_id: () => gameId(),
    enabled: () => !!accountStore.id && !!gameId(),
    silenced: true,
  });

  const blackout = createMemo(() => game.data?.blackout === true && !isAdminOfGame(game.data));
  const selfRank = useTeamRank({
    game_id: () => gameId(),
    team_id: () => selfTeam.data?.id ?? 0,
    enabled: () => blackout() && !!selfTeam.data,
  });

  const canAccessChallenges = createMemo(() => {
    return isPlayerCanAccessChallenges(game.data, selfTeam.data ?? null);
  });

  const isArchived = createMemo(() => isGameInArchived(game.data));

  const challenges = useChallenges({
    game_id: () => gameId(),
    enabled: () => gameId() > 0 && canAccessChallenges()[0] && !blackout(),
  });

  const topTeamsQueryAll = useGameScoreboard({
    id: () => gameId(),
    page: () => 1,
    page_size: () => 10,
    with_hidden: () => showHiddenTeams(),
    enabled: () => gameId() > 0 && !selectedInstituteId() && !blackout(),
  });

  const topTeamsQueryByInstitute = useGameScoreboard({
    id: () => gameId(),
    page: () => 1,
    page_size: () => 10,
    with_hidden: () => showHiddenTeams(),
    institute_id: () => selectedInstituteId()!,
    enabled: () => gameId() > 0 && !!selectedInstituteId() && !blackout(),
  });

  const teamsQueryAll = useGameScoreboard({
    id: () => gameId(),
    page: () => page(),
    page_size: () => pageSize() ?? 15,
    with_hidden: () => showHiddenTeams(),
    enabled: () => gameId() > 0 && !!pageSize() && !selectedInstituteId() && !blackout(),
  });

  const teamsQueryByInstitute = useGameScoreboard({
    id: () => gameId(),
    page: () => page(),
    page_size: () => pageSize() ?? 15,
    with_hidden: () => showHiddenTeams(),
    institute_id: () => selectedInstituteId()!,
    enabled: () => gameId() > 0 && !!pageSize() && !!selectedInstituteId() && !blackout(),
  });

  const activeTopTeamsQuery = createMemo(() => (selectedInstituteId() ? topTeamsQueryByInstitute : topTeamsQueryAll));
  const activeTeamsQuery = createMemo(() => (selectedInstituteId() ? teamsQueryByInstitute : teamsQueryAll));

  const topTeams = createMemo(() => activeTopTeamsQuery().data?.[0] ?? []);
  const teams = createMemo<Team[]>(() => activeTeamsQuery().data?.[0] ?? []);
  const total = createMemo(() => activeTeamsQuery().data?.[1] ?? 0);
  const challengeList = createMemo(() => challenges.data?.[0] ?? []);

  onMount(async () => {
    pageHeight = createElementSize(autoPageSizeWatcher!);
  });

  function handleRefresh() {
    topTeamsQueryAll.refetch();
    topTeamsQueryByInstitute.refetch();
    teamsQueryAll.refetch();
    teamsQueryByInstitute.refetch();
    challenges.refetch();
  }

  let autoPageSizeWatcher: HTMLDivElement;
  let pageHeight: Readonly<Size>;

  const teamChartSeries = () => {
    return topTeams().map((t) => ({
      name: t.name,
      type: "line",
      step: "end",
      data: [[game.data?.start_at.toMillis() ?? Date.now(), 0]]
        .concat(
          t.history
            .filter((h) => {
              if (game.data && game.data.start_at < DateTime.now()) {
                return h.changed_at > game.data?.start_at && h.changed_at < game.data?.end_at;
              }
              return true;
            })
            .map((h) =>
              h.challenge_id || showReal()
                ? [
                    h.changed_at.toMillis(),
                    showReal()
                      ? h.score
                      : t.history
                          .filter((i) => i.changed_at <= h.changed_at && i.challenge_id)
                          .map((i) => challengeList().find((c) => c.id === i.challenge_id)?.score ?? 0)
                          .reduce((a, b) => a + b, 0),
                  ]
                : null
            )
            .filter((i) => i !== null)
        )
        .concat([[Math.min(Date.now(), game.data?.end_at.toMillis() ?? Date.now()), t.score]]),
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

  return (
    <>
      <Title page={t("game.scoreboard.title")} route={`/games/${gameId()}/scoreboard`} />
      <Show when={blackout()}>
        <div class="flex-1 flex items-center justify-center p-3 lg:p-6">
          <div class="w-full max-w-lg border border-layer-content/10 rounded-lg p-6 flex flex-col items-center space-y-4">
            <span class="icon-[fluent--lightbulb-filament-20-regular] w-12 h-12 text-warning" />
            <h1 class="text-2xl font-bold">{t("game.scoreboard.title")}</h1>
            <Show
              when={selfTeam.data}
              fallback={<p class="opacity-60 text-center">{t("game.scoreboard.blackoutSpectator")}</p>}
            >
              <p class="opacity-60 text-center">{t("game.scoreboard.blackout")}</p>
              <div class="flex flex-row items-center space-x-8 text-xl">
                <span class="font-bold text-success">{selfTeam.data?.score ?? 0} pts</span>
                <span class="font-bold text-warning">#{selfRank.data ?? "-"}</span>
              </div>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={!blackout()}>
        <div class="flex flex-col lg:flex-row flex-1 min-w-min">
          <div ref={autoPageSizeWatcher!} class="fixed h-[calc(100vh-24rem)]" />
          <Show when={topTeams().length > 0}>
          <div
            class={clsx(
              "lg:sticky w-full top-0 left-0",
              showChallengeDetail()
                ? "lg:w-[30vw] lg:max-w-100 backdrop-blur-sm border-r border-r-layer-content/10"
                : showLargePanel()
                  ? "lg:w-[75vw] justify-center"
                  : "lg:w-[40vw]",
              "transition-[height,width] duration-500 p-3 lg:p-6 flex flex-col space-y-2 shrink-0"
            )}
          >
            <div class={clsx("p-2", "relative", showChallengeDetail() ? "h-48" : "aspect-video")}>
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
                      fontFamily: "Reverier Mono",
                    },
                  },
                  series: teamChartSeries(),
                }}
              />
              <Show when={teams().length === 0}>
                <div class="absolute top-0 left-0 w-full h-full flex flex-col space-y-6 items-center justify-center">
                  <span class="shrink-0 icon-[fluent--data-trending-48-regular] w-12 h-12 opacity-60" />
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
                      fallback={<span class="shrink-0 icon-[fluent--arrow-expand-20-regular] w-5 h-5" />}
                    >
                      <span class="shrink-0 icon-[fluent--arrow-minimize-20-regular] w-5 h-5" />
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
                    <Show
                      when={showPlane()}
                      fallback={<span class="shrink-0 icon-[fluent--airplane-20-regular] w-5 h-5" />}
                    >
                      <span class="shrink-0 icon-[fluent--airplane-20-filled] w-5 h-5" />
                    </Show>
                  </Button>
                  <Button
                    ghost
                    square
                    level="info"
                    onClick={() => setShowReal(!showReal())}
                    class="hidden lg:flex"
                    size={showChallengeDetail() ? "sm" : "md"}
                    disabled={!canAccessChallenges()[0]}
                  >
                    <Show
                      when={showReal()}
                      fallback={<span class="shrink-0 icon-[fluent--group-20-regular] w-5 h-5" />}
                    >
                      <span class="shrink-0 icon-[fluent--group-20-filled] w-5 h-5" />
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
                  disabled={!canAccessChallenges()[0] && !isArchived()}
                >
                  <Show
                    when={showChallengeDetail()}
                    fallback={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
                  >
                    <span class="shrink-0 icon-[fluent--flag-20-filled] w-5 h-5" />
                  </Show>
                </Button>
              </div>
              <Show when={showChallengeDetail()}>
                <div class="absolute bottom-2 left-2 right-2">
                  <ChartOperations
                    size="sm"
                    ghost
                    onRefresh={handleRefresh}
                    showHiddenTeams={showHiddenTeams()}
                    onShowHiddenTeams={(e) => setSearchParams({ hidden: e ? "true" : null })}
                    onInstituteChanged={(e) => setSearchParams({ institute: e })}
                    institute={selectedInstituteId()}
                  />
                </div>
              </Show>
            </div>
            <Show when={!showChallengeDetail()}>
              <ChartOperations
                size="md"
                showHiddenTeams={showHiddenTeams()}
                onRefresh={handleRefresh}
                onShowHiddenTeams={(e) => setSearchParams({ hidden: e ? "true" : null })}
                onInstituteChanged={(e) => setSearchParams({ institute: e })}
                institute={selectedInstituteId()}
              />
            </Show>
            <Switch>
              <Match when={!showChallengeDetail() && !showLargePanel()}>
                <TeamDetails gameId={gameId()} topTeams={topTeams().slice(0, 3)} challenges={challengeList()} />
              </Match>
              <Match when={showChallengeDetail()}>
                <TeamRanks
                  gameId={gameId()}
                  game={game.data}
                  institutes={institutes.data ?? []}
                  teams={teams()}
                  page={page()}
                  pageSize={pageSize()!}
                  total={total()}
                  showTime={false}
                  loading={activeTeamsQuery().isLoading}
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
                  gameId={gameId()}
                  game={game.data}
                  institutes={institutes.data ?? []}
                  teams={teams()}
                  page={page()}
                  pageSize={pageSize()!}
                  showTime={!showLargePanel()}
                  loading={activeTeamsQuery().isLoading}
                  onPageChange={(p) => setPage(p)}
                  total={total()}
                />
              </>
            }
          >
            <TeamSolves game={game.data} teams={teams()} challenges={challengeList()} />
          </Show>
          </div>
        </div>
      </Show>
    </>
  );
}

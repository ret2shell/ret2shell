import { handleHttpError } from "@api";
import { useChallenges } from "@api/challenge";
import { useGame } from "@api/game";
import { type ChallengeStat, type GameStat, getUser, getUserTeams, useUserSubmissionStats } from "@api/user";
import SidebarLayout from "@blocks/sidebar-layout";
import { HostType } from "@models/game";
import type { Team } from "@models/team";
import type { User } from "@models/user";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import Chart from "@widgets/chart";
import LoadingTips from "@widgets/loading-tips";
import Select from "@widgets/select";
import clsx from "clsx";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch, untrack } from "solid-js";
import { Transition } from "solid-transition-group";
import Sidebar from "./_blocks/sidebar";

export default function () {
  const [user, setUser] = createSignal(null as null | User);
  const [loading, setLoading] = createSignal(true);
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = () => Number.parseInt(params.user ?? "", 10) || null;
  const [teams, setTeams] = createSignal([] as Team[]);

  const selectedGameId = () => (searchParams.game as string) || null;
  const [selectedStatus, setSelectedStatus] = createSignal<string>("all");

  const submissionStats = useUserSubmissionStats({
    id: () => userId()!,
    game_id: () => {
      const val = selectedGameId();
      return val ? Number.parseInt(val, 10) : null;
    },
    enabled: () => !!userId(),
  });

  const allGameStats = useUserSubmissionStats({
    id: () => userId()!,
    game_id: () => null,
    enabled: () => !!userId(),
  });

  const game = useGame({
    id: () => Number.parseInt(selectedGameId()!, 10),
    enabled: () => !!selectedGameId(),
  });

  const challenges = useChallenges({
    game_id: () => Number.parseInt(selectedGameId()!, 10),
    enabled: () => !!selectedGameId(),
  });

  createEffect(() => {
    if (!userId()) {
      navigate("/sigtrap/404", { replace: true });
    }
    untrack(async () => {
      setLoading(true);
      try {
        setUser(await getUser(userId()!));
        setTeams(
          (await getUserTeams(userId()!)).sort((a, b) => a.last_active_at.toMillis() - b.last_active_at.toMillis())
        );
      } catch (err) {
        handleHttpError(err as Error, t("team.errors.fetchList.title"));
      }
      setLoading(false);
    });
  });

  const gameOptions = createMemo(() => {
    const games = new Map<number, string>();
    const stats = allGameStats.data;
    if (stats && stats.length > 0 && "game_id" in stats[0]) {
      for (const g of stats as GameStat[]) {
        games.set(g.game_id, g.game_name);
      }
    }
    for (const team of teams()) {
      if (team.game_id && team.game_name) {
        games.set(team.game_id, team.game_name);
      }
    }
    return [
      { label: t("user.stats.allGames"), value: "" },
      ...Array.from(games.entries()).map(([id, name]) => ({
        label: name,
        value: id.toString(),
      })),
    ];
  });

  const statusOptions = createMemo(() => [
    { label: t("user.statusFilter.all"), value: "all" },
    { label: t("user.statusFilter.notAttempted"), value: "not_attempted" },
    { label: t("user.statusFilter.attempted"), value: "attempted" },
    { label: t("user.statusFilter.solved"), value: "solved" },
  ]);

  const challengesEx = createMemo(() => {
    if (!selectedGameId() || !challenges.data) return null;
    const stats = submissionStats.data as ChallengeStat[] | undefined;
    const isTraining = game.data?.host_type === HostType.Training;
    return (challenges.data[0] ?? [])
      .filter((c) => !c.hidden)
      .map((challenge) => {
        const stat = stats?.find((s) => s.challenge_id === challenge.id);
        const total = stat?.total ?? 0;
        const solved = stat?.solved ?? 0;
        return {
          challenge,
          total,
          solved,
          link: isTraining
            ? `/training/${challenge.game_id}?challenge=${challenge.id}`
            : `/games/${challenge.game_id}/challenges?challenge=${challenge.id}`,
        };
      })
      .sort((a, b) => {
        if (a.challenge.score !== b.challenge.score) return a.challenge.score - b.challenge.score;
        return a.challenge.name < b.challenge.name ? -1 : 1;
      });
  });

  const filteredChallenges = createMemo(() => {
    const items = challengesEx();
    if (!items) return null;
    const status = selectedStatus();
    switch (status) {
      case "not_attempted":
        return items.filter((item) => item.total === 0);
      case "attempted":
        return items.filter((item) => item.total > 0 && item.solved === 0);
      case "solved":
        return items.filter((item) => item.solved > 0);
      default:
        return items;
    }
  });

  const pieOption = createMemo(() => {
    const stats = submissionStats.data;
    if (!stats || stats.length === 0) return null;
    let solved: number;
    let total: number;
    if (!selectedGameId()) {
      const games = stats as GameStat[];
      solved = games.reduce((sum, g) => sum + g.solved, 0);
      total = games.reduce((sum, g) => sum + g.total, 0);
    } else {
      const challenges = stats as ChallengeStat[];
      solved = challenges.filter((c) => c.solved > 0).length;
      total = challenges.length;
    }
    return {
      title: {
        text: `${((solved / Math.max(total, 1)) * 100).toFixed(0)}%`,
        left: "center",
        top: "center",
        textStyle: {
          fontSize: 20,
          fontWeight: "bold",
        },
      },
      series: [
        {
          type: "pie",
          radius: ["50%", "70%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          data: [
            {
              value: solved,
              name: t("user.stats.solved"),
              itemStyle: { color: "#17a750" },
            },
            {
              value: total - solved,
              name: t("user.stats.failed"),
              itemStyle: { color: "#808080" },
            },
          ],
        },
      ],
    };
  });

  const chartOption = createMemo(() => {
    const stats = submissionStats.data;
    if (!stats || stats.length === 0) return null;
    if (selectedGameId()) {
      const challenges = stats as ChallengeStat[];
      const sorted = [...challenges].sort((a, b) => b.total - a.total);
      return {
        grid: {
          left: "16px",
          right: "32px",
          bottom: "32px",
          top: "16px",
          containLabel: true,
        },
        tooltip: {
          trigger: "axis",
          axisPointer: {
            type: "line",
            label: { precision: 0 },
            snap: true,
          },
          borderColor: "transparent",
        },
        xAxis: {
          type: "category",
          data: sorted.map((c) => c.challenge_name),
          axisLabel: { rotate: 30, fontSize: 11 },
        },
        yAxis: {
          type: "value",
          min: 0,
          minInterval: 1,
        },
        series: [
          {
            name: t("user.stats.solved"),
            type: "bar",
            stack: "total",
            data: sorted.map((c) => c.solved),
            itemStyle: { color: "#17a750" },
            barMaxWidth: 48,
          },
          {
            name: t("user.stats.failed"),
            type: "bar",
            stack: "total",
            data: sorted.map((c) => c.total - c.solved),
            itemStyle: { color: "#808080" },
            barMaxWidth: 48,
          },
        ],
      };
    }
    const games = stats as GameStat[];
    const sorted = [...games].sort((a, b) => b.total - a.total);
    return {
      grid: {
        left: "16px",
        right: "32px",
        bottom: "32px",
        top: "16px",
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          label: { precision: 0 },
          snap: true,
        },
        borderColor: "transparent",
      },
      xAxis: {
        type: "category",
        data: sorted.map((g) => g.game_name),
        axisLabel: { rotate: 30, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        min: 0,
        minInterval: 1,
      },
      series: [
        {
          name: t("user.stats.solved"),
          type: "bar",
          stack: "total",
          data: sorted.map((g) => g.solved),
          itemStyle: { color: "#17a750" },
          barMaxWidth: 48,
        },
        {
          name: t("user.stats.failed"),
          type: "bar",
          stack: "total",
          data: sorted.map((g) => g.total - g.solved),
          itemStyle: { color: "#808080" },
          barMaxWidth: 48,
        },
      ],
    };
  });

  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);

  return (
    <>
      <Title page={user()?.nickname} route={`/users/${user()?.id}`} />
      <SidebarLayout leftBar={() => <Sidebar user={user()} loading={loading()} />} showLeftBar={showSidebar()}>
        <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
          <div class="flex flex-col w-full max-w-5xl">
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--data-pie-20-regular] w-5 h-5" />
              <span class="flex-1">{t("user.stats.title")}</span>
              <Select
                size="sm"
                class="w-64"
                items={gameOptions()}
                value={selectedGameId() ? [selectedGameId()!] : []}
                onValueChange={(e) => {
                  const game = e.value[0] || undefined;
                  setSearchParams({ game });
                }}
                placeholder={t("user.stats.allGames")}
              />
            </h3>
            <section class="flex flex-col p-2">
              <Switch>
                <Match when={submissionStats.isLoading}>
                  <LoadingTips />
                </Match>
                <Match when={!submissionStats.data || submissionStats.data.length === 0}>
                  <div class="h-12 flex items-center justify-center opacity-60">
                    <span>{t("user.stats.empty")}</span>
                  </div>
                </Match>
                <Match when={true}>
                  <div class="flex flex-row gap-4 py-2">
                    <div class="w-64 h-64 flex items-center justify-center">
                      <Show when={pieOption()} fallback={<LoadingTips />}>
                        <Chart option={pieOption()!} />
                      </Show>
                    </div>
                    <div class="flex-1 h-64">
                      <Show when={chartOption()}>
                        <Chart option={chartOption()!} />
                      </Show>
                    </div>
                  </div>
                </Match>
              </Switch>
            </section>
            <div class="h-6" />
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span class="flex-1">{selectedGameId() ? t("user.solvedProblems") : t("user.joinedGames")}</span>
              <Show when={selectedGameId()}>
                <Select
                  size="sm"
                  class="w-40"
                  items={statusOptions()}
                  value={selectedStatus() === "all" ? [] : [selectedStatus()]}
                  onValueChange={(e) => {
                    setSelectedStatus(e.value[0] || "all");
                  }}
                  placeholder={t("user.statusFilter.all")}
                />
              </Show>
            </h3>
            <section class="flex flex-col">
              <Switch>
                <Match when={!selectedGameId()}>
                  <For each={teams()}>
                    {(team) => (
                      <A
                        class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 hover:bg-layer-content/5 hover:cursor-pointer"
                        href={`/games/${team.game_id}/teams/${team.id}`}
                      >
                        <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5 text-warning" />
                        <span class="flex-1 text-start truncate">
                          {t("user.gameJournal", {
                            team: team.name,
                            game: team.game_name!,
                          })}
                        </span>
                        <span class="opacity-60">{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                      </A>
                    )}
                  </For>
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                    <span class="shrink-0 icon-[fluent--search-sparkle-20-regular] w-5 h-5 text-info" />
                    <span>{t("user.moreJournal")}</span>
                  </div>
                </Match>
                <Match when={challenges.isLoading}>
                  <LoadingTips />
                </Match>
                <Match when={filteredChallenges() && filteredChallenges()!.length > 0}>
                  <For each={filteredChallenges()!}>
                    {(item) => (
                      <A
                        class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 hover:bg-layer-content/5 hover:cursor-pointer"
                        href={item.link}
                      >
                        <span
                          class={clsx(
                            "shrink-0 w-5 h-5",
                            item.solved > 0
                              ? "icon-[fluent--checkmark-circle-20-regular] text-success"
                              : "icon-[fluent--flag-20-regular] text-warning"
                          )}
                        />
                        <span class="flex-1 text-start truncate">{item.challenge.name}</span>
                        <span class="opacity-60">{item.challenge.score} pts</span>
                      </A>
                    )}
                  </For>
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                    <span class="shrink-0 icon-[fluent--search-sparkle-20-regular] w-5 h-5 text-info" />
                    <span>{t("user.moreJournal")}</span>
                  </div>
                </Match>
                <Match when={true}>
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                    <span class="shrink-0 icon-[fluent--search-sparkle-20-regular] w-5 h-5 text-info" />
                    <span>{t("challenge.empty")}</span>
                  </div>
                </Match>
              </Switch>
            </section>
            <div class="h-6" />
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />
              <span>{t("user.description.title")}</span>
            </h3>
            <section class="py-2">
              <Switch>
                <Match when={loading()}>
                  <LoadingTips />
                </Match>
                <Match when={true}>
                  <Article content={user()?.description || t("user.description.empty")} />
                </Match>
              </Switch>
            </section>
          </div>
        </div>
      </SidebarLayout>
      <Transition name="slide-fade-right">
        <Show when={!matches.lg}>
          <Button
            class="fixed bottom-3 right-3 z-30"
            square
            onClick={() => setShowSidebar(!showSidebar())}
            type="button"
          >
            <span
              class={clsx(
                "transition-transform",
                showSidebar() ? "rotate-90" : "rotate-0",
                showSidebar() ? "icon-[fluent--dismiss-20-regular]" : "icon-[fluent--person-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
        </Show>
      </Transition>
    </>
  );
}

import { handleHttpError } from "@api";
import { getUser, getUserSubmissions, getUserTeams, useUserSubmissionStats } from "@api/user";
import SidebarLayout from "@blocks/sidebar-layout";
import type { Submission } from "@models/submission";
import type { Team } from "@models/team";
import type { User } from "@models/user";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import Chart from "@widgets/chart";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Select from "@widgets/select";
import clsx from "clsx";
import { createEffect, createMemo, createResource, createSignal, For, Match, Show, Switch, untrack } from "solid-js";
import { Transition } from "solid-transition-group";
import Sidebar from "./_blocks/sidebar";

export default function () {
  const [user, setUser] = createSignal(null as null | User);
  const [loading, setLoading] = createSignal(true);
  const params = useParams();
  const navigate = useNavigate();
  const userId = () => Number.parseInt(params.user ?? "", 10) || null;
  const [teams, setTeams] = createSignal([] as Team[]);
  const [submissions, setSubmissions] = createSignal([] as Submission[]);
  const [submissionTotal, setSubmissionTotal] = createSignal(0);
  const [submissionPage, setSubmissionPage] = createSignal(1);
  const [selectedGameId, setSelectedGameId] = createSignal<string | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = createSignal(false);
  const pageSize = 10;

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
    for (const team of teams()) {
      if (team.game_id && team.game_name) {
        games.set(team.game_id, team.game_name);
      }
    }
    return [
      { label: t("user.submissions.allGames"), value: "" },
      ...Array.from(games.entries()).map(([id, name]) => ({
        label: name,
        value: id.toString(),
      })),
    ];
  });

  const teamIdToGameId = createMemo(() => {
    const map = new Map<number, number>();
    for (const team of teams()) {
      map.set(team.id, team.game_id);
    }
    return map;
  });

  const gameIdToGameName = createMemo(() => {
    const map = new Map<number, string>();
    for (const team of teams()) {
      if (team.game_name) {
        map.set(team.game_id, team.game_name);
      }
    }
    return map;
  });

  const submissionStats = useUserSubmissionStats({
    id: () => userId()!,
    game_id: () => {
      const val = selectedGameId();
      return val ? Number.parseInt(val, 10) : null;
    },
    enabled: () => !!userId(),
  });

  const chartOption = createMemo(() => {
    const stats = submissionStats.data;
    if (!stats || stats.challenges.length === 0) return null;
    const sortedChallenges = [...stats.challenges].sort((a, b) => b.total_submissions - a.total_submissions);
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
          type: "shadow",
        },
      },
      xAxis: {
        type: "category",
        data: sortedChallenges.map((c) => c.challenge_name),
        axisLabel: {
          rotate: 30,
          fontSize: 11,
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        interval: 1,
      },
      series: [
        {
          name: t("user.submissions.solved"),
          type: "bar",
          stack: "total",
          data: sortedChallenges.map((c) => (c.solved ? 1 : 0)),
          itemStyle: {
            color: "#17a750",
          },
          barMaxWidth: 48,
        },
        {
          name: t("user.submissions.failed"),
          type: "bar",
          stack: "total",
          data: sortedChallenges.map((c) => c.failed_submissions),
          itemStyle: {
            color: "#808080",
          },
          barMaxWidth: 48,
        },
      ],
    };
  });

  createEffect(() => {
    const uid = userId();
    const page = submissionPage();
    const gameId = selectedGameId();
    if (!uid) return;
    untrack(async () => {
      setLoadingSubmissions(true);
      try {
        const [data, total] = await getUserSubmissions(
          uid,
          page,
          pageSize,
          gameId ? Number.parseInt(gameId, 10) : undefined
        );
        setSubmissions(data);
        setSubmissionTotal(total);
      } catch (err) {
        handleHttpError(err as Error, t("user.errors.fetchSubmissions.title"));
      }
      setLoadingSubmissions(false);
    });
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
              <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />
              <span>{t("user.description.title")}</span>
            </h3>
            <section class="max-h-96 overflow-y-auto">
              <Switch>
                <Match when={loading()}>
                  <LoadingTips />
                </Match>
                <Match when={true}>
                  <Article content={user()?.description || t("user.description.empty")} noExtraPaddings compact />
                </Match>
              </Switch>
            </section>
            <div class="h-6" />
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{t("user.joinedGames")}</span>
            </h3>
            <section class="flex flex-col">
              <For each={teams()}>
                {(team) => (
                  <A
                    class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 hover:bg-layer-content/5 hover:cursor-pointer"
                    href={`/games/${team.game_id}/teams/${team.id}`}
                  >
                    <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5 text-warning" />
                    <span class="flex-1 text-start truncate">
                      {t("user.gameJournal", { team: team.name, game: team.game_name! })}
                    </span>
                    <span class="opacity-60">{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                  </A>
                )}
              </For>
              <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                <span class="shrink-0 icon-[fluent--search-sparkle-20-regular] w-5 h-5 text-info" />
                <span>{t("user.moreJournal")}</span>
              </div>
            </section>
            <div class="h-6" />
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--checkmark-20-regular] w-5 h-5" />
              <span>{t("user.submissions.title")}</span>
            </h3>
            <section class="flex flex-col">
              <div class="flex flex-row items-center py-3">
                <Select
                  size="sm"
                  class="w-64"
                  items={gameOptions()}
                  value={selectedGameId() ?? ""}
                  onValueChange={(e) => {
                    setSelectedGameId(e.value[0] || null);
                    setSubmissionPage(1);
                  }}
                  placeholder={t("user.submissions.allGames")}
                />
              </div>
              <Show when={chartOption() && !submissionStats.isLoading}>
                <div class="h-64 py-2">
                  <Chart option={chartOption()!} />
                </div>
              </Show>
              <Switch>
                <Match when={loadingSubmissions()}>
                  <LoadingTips />
                </Match>
                <Match when={submissions().length === 0}>
                  <div class="h-12 flex items-center justify-center opacity-60">
                    <span>{t("user.submissions.empty")}</span>
                  </div>
                </Match>
                <Match when={true}>
                  <div class="overflow-x-auto">
                    <table class="table table-sm w-full">
                      <thead>
                        <tr class="border-b border-b-layer-content/15">
                          <th class="text-start h-10 font-normal opacity-60">{t("user.submissions.challenge")}</th>
                          <th class="text-start h-10 font-normal opacity-60">{t("user.submissions.game")}</th>
                          <th class="text-start h-10 font-normal opacity-60">{t("user.submissions.team")}</th>
                          <th class="text-end h-10 font-normal opacity-60">{t("user.submissions.score")}</th>
                          <th class="text-center h-10 font-normal opacity-60">{t("user.submissions.status")}</th>
                          <th class="text-end h-10 font-normal opacity-60">{t("user.submissions.time")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={submissions()}>
                          {(sub) => (
                            <tr class="border-b border-b-layer-content/10 hover:bg-layer-content/5">
                              <td class="text-start py-3">
                                <Show
                                  when={sub.team_id && teamIdToGameId().has(sub.team_id)}
                                  fallback={
                                    <span class="opacity-60">{sub.challenge_name}</span>
                                  }
                                >
                                  <A
                                    href={`/games/${teamIdToGameId().get(sub.team_id)}/challenges?challenge=${sub.challenge_id}`}
                                    class="hover:underline"
                                  >
                                    {sub.challenge_name}
                                  </A>
                                </Show>
                              </td>
                              <td class="text-start py-3 opacity-80">
                                {(sub.team_id && gameIdToGameName().get(teamIdToGameId().get(sub.team_id)!)) ?? "-"}
                              </td>
                              <td class="text-start py-3 opacity-80">{sub.team_name ?? "-"}</td>
                              <td class="text-end py-3">{sub.score ?? "-"}</td>
                              <td class="text-center py-3">
                                <Show
                                  when={sub.solved}
                                  fallback={
                                    <span class="text-error">
                                      {t("user.submissions.failed")}
                                    </span>
                                  }
                                >
                                  <span class="text-success">
                                    {t("user.submissions.solved")}
                                  </span>
                                </Show>
                              </td>
                              <td class="text-end py-3 opacity-60">
                                {sub.created_at.toFormat("yyyy-MM-dd HH:mm")}
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                  <Show when={submissionTotal() > pageSize}>
                    <div class="flex justify-center py-4">
                      <Pagination
                        count={submissionTotal()}
                        pageSize={pageSize}
                        page={submissionPage()}
                        onPageChange={(p) => setSubmissionPage(p.page)}
                      />
                    </div>
                  </Show>
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

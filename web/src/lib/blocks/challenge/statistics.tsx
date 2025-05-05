import { handleHttpError } from "@api";
import { getChallengeCommitHistory, getChallengeSubmission } from "@api/game";
import type { Challenge, CommitHistory } from "@models/challenge";
import type { Submission } from "@models/submission";
import { createBreakpoints } from "@solid-primitives/media";
import { challengeStore } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { breakpoints, t } from "@storage/theme";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Tag from "@widgets/tag";
import { DateTime } from "luxon";
import { For, Match, Show, Switch, createEffect, createSignal, untrack } from "solid-js";

function StatisticsPanel() {
  const [solves, setSolves] = createSignal([] as Submission[]);
  const [page, setPage] = createSignal(1);
  const [pageSize, _setPageSize] = createSignal(10);
  const [total, setTotal] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  const [onlySolved, setOnlySolved] = createSignal(true);
  async function fetchSolves() {
    setLoading(true);
    try {
      const resp = await getChallengeSubmission(
        gameStore.current!.id,
        challengeStore.current!.id,
        page(),
        pageSize(),
        onlySolved()
      );
      setSolves(resp[0]);
      setTotal(resp[1]);
    } catch (err) {
      handleHttpError(err as Error, t("challenge.statistics.errors.fetchSubmission.title")!);
    }
    setLoading(false);
  }

  createEffect(() => {
    if (challengeStore.current && page()) {
      if (onlySolved()) {
        // .. NOTE: just placable
      }
      untrack(fetchSolves);
    }
  });
  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <h3 class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
        <span class="icon-[fluent--data-trending-20-regular] w-5 h-5 text-primary" />
        <span class="flex-1">{t("challenge.statistics.title")}</span>
        <Button
          size="sm"
          onClick={() => {
            setOnlySolved(!onlySolved());
            setPage(1);
          }}
        >
          <span
            class={
              onlySolved() ? "icon-[fluent--eye-20-regular] w-5 h-5" : "icon-[fluent--eye-20-regular] w-5 h-5 text-info"
            }
          />
          <span>{t("challenge.statistics.showAll")}</span>
        </Button>
      </h3>
      <Show when={loading()}>
        <div class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
          <LoadingTips />
        </div>
      </Show>
      <For each={solves()}>
        {(item) => (
          <div class="min-h-12 w-full flex flex-row py-2 gap-y-2 px-2 flex-wrap justify-end space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden">
            <div class="flex flex-row space-x-2 items-center overflow-hidden *:whitespace-nowrap mx-0">
              <span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success shrink-0" />
              <a class="truncate hover:underline" href={`/users/${item.user_id}`}>
                {item.user_name}
              </a>
              <span class="opacity-60">@</span>
              <a class="truncate hover:underline" href={`/games/${gameStore.current?.id}/teams/${item.team_id}`}>
                {item.team_name ?? "wheel"}
              </a>
              <span>{t("challenge.submission.submit")}</span>
              <span class="flex-1 truncate py-1 px-2 rounded-lg bg-layer-content/5" title={item.content || ""}>
                {item.content}
              </span>
            </div>
            <span class="flex-1 mx-0" />
            <div class="gap-y-2 flex flex-row space-x-2 items-center flex-wrap justify-end">
              <Tag level={item.solved ? "success" : "warning"}>
                <span>
                  {item.solved === null
                    ? t("challenge.submission.status.pending.title")
                    : item.solved
                      ? t("challenge.submission.status.solved.title")
                      : t("challenge.submission.status.failed.title")}
                </span>
              </Tag>
              <span class="opacity-40" title={item.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}>
                <Switch fallback={item.created_at.toFormat("MM-dd HH:mm:ss")}>
                  <Match when={matches.xl}>{item.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</Match>
                </Switch>
              </span>
            </div>
          </div>
        )}
      </For>
      <Pagination
        class="p-6 lg:p-9"
        count={total()}
        pageSize={pageSize()}
        page={page()}
        onPageChange={(p) => setPage(p.page)}
      />
    </>
  );
}

function HistoryPanel() {
  const [history, setHistory] = createSignal([] as CommitHistory[]);
  const [loading, setLoading] = createSignal(false);
  createEffect(() => {
    if (challengeStore.current) {
      untrack(async () => {
        setLoading(true);
        try {
          setHistory(await getChallengeCommitHistory(gameStore.current!.id, challengeStore.current!.id));
        } catch (err) {
          handleHttpError(err as Error, t("challenge.statistics.errors.fetchCommitHistory")!);
        }
        setLoading(false);
      });
    }
  });
  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <h3 class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
        <span class="icon-[fluent--data-trending-20-regular] w-5 h-5 text-primary" />
        <span>{t("challenge.statistics.commits.title")}</span>
      </h3>
      <Show when={loading()}>
        <div class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
          <LoadingTips />
        </div>
      </Show>
      <For each={history()}>
        {(item) => (
          <div class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
            <span class="icon-[fluent--branch-request-20-regular] w-5 h-5 text-primary shrink-0" />
            <span class="truncate" title={item.subject}>
              {item.subject}
            </span>
            <span class="flex-1" />
            <span class="font-bold">{item.author.name}</span>
            <span class="font-bold text-primary opacity-40 truncate">{item.abbreviated_commit}</span>
            <span class="opacity-40 whitespace-nowrap">
              <Switch fallback={DateTime.fromSeconds(item.author.date).toFormat("MM-dd")}>
                <Match when={matches.xl}>
                  {DateTime.fromSeconds(item.author.date).toFormat("yyyy-MM-dd HH:mm:ss")}
                </Match>
                <Match when={matches.lg}>{DateTime.fromSeconds(item.author.date).toFormat("MM-dd HH:mm:ss")}</Match>
                <Match when={matches.md}>{DateTime.fromSeconds(item.author.date).toFormat("MM-dd HH:mm:ss")}</Match>
                <Match when={matches.sm}>{DateTime.fromSeconds(item.author.date).toFormat("MM-dd HH:mm")}</Match>
              </Switch>
            </span>
          </div>
        )}
      </For>
    </>
  );
}

export default function (_props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
}) {
  const [tab, setTab] = createSignal("statistics" as "statistics" | "history");
  return (
    <div class="flex flex-row min-h-full">
      <ul class="w-1/5 min-w-48 flex flex-col space-y-2 p-3 lg:p-6 sticky top-0 self-start">
        <li class="w-full">
          <Button
            ghost={tab() !== "statistics"}
            class="h-auto w-full"
            onClick={() => setTab("statistics")}
            title={t("challenge.statistics.solves.title")}
          >
            <div class="flex flex-col py-2 items-start w-full">
              <span>{t("challenge.statistics.solves.title")}</span>
              <span class="font-normal opacity-60 w-full text-start truncate">
                {t("challenge.statistics.solves.subject")}
              </span>
            </div>
          </Button>
        </li>
        <li class="w-full">
          <Button
            ghost={tab() !== "history"}
            class="h-auto w-full"
            onClick={() => setTab("history")}
            title={t("challenge.statistics.commits.title")}
          >
            <div class="flex flex-col py-2 items-start w-full">
              <span>{t("challenge.statistics.commits.title")}</span>
              <span class="font-normal opacity-60 w-full text-start truncate">
                {t("challenge.statistics.commits.subject")}
              </span>
            </div>
          </Button>
        </li>
      </ul>
      <Divider direction="vertical" />
      <div class="flex-1 w-0 flex flex-col p-3 lg:p-6">
        <Switch>
          <Match when={tab() === "statistics"}>
            <StatisticsPanel />
          </Match>
          <Match when={tab() === "history"}>
            <HistoryPanel />
          </Match>
        </Switch>
      </div>
    </div>
  );
}

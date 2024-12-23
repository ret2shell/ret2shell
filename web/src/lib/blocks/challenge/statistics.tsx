import { getChallengeCommitHistory, getChallengeSubmission } from "@api/game";
import type { Challenge, CommitHistory } from "@models/challenge";
import type { Submission } from "@models/submission";
import { challengeStore } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
import Pagination from "@widgets/pagination";
import LoadingTips from "@widgets/loading-tips";
import { DateTime } from "luxon";
import { For, Match, Show, Switch, createEffect, createSignal, untrack } from "solid-js";
import { handleHttpError } from "@api";
import Tag from "@widgets/tag";

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
      handleHttpError(err as Error, t("game.challenge.fetchSolveStatusFailed")!);
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
  return (
    <>
      <h3 class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
        <span class="icon-[fluent--data-trending-20-regular] w-5 h-5 text-primary" />
        <span class="flex-1">{t("game.challenge.statistics")}</span>
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
          <span>{t("game.challenge.showAll")}</span>
        </Button>
      </h3>
      <Show when={loading()}>
        <div class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
          <LoadingTips />
        </div>
      </Show>
      <For each={solves()}>
        {(item) => (
          <div class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
            <span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success" />
            <a class="truncate hover:underline" href={`/users/${item.user_id}`}>
              {item.user_name}
            </a>
            <span class="opacity-60">@</span>
            <a class="truncate hover:underline" href={`/games/${gameStore.current?.id}/teams/${item.team_id}`}>
              {item.team_name ?? "wheel"}
            </a>
            <span>{t("game.monitor.submit")}</span>
            <span class="flex-1 w-0 overflow-hidden flex items-center" title={item.content!}>
              <span class="max-w-full truncate py-1 px-2 rounded-lg bg-layer-content/5">{item.content}</span>
            </span>
            <Tag level={item.solved ? "success" : "warning"}>
              <span>
                {item.solved === null
                  ? t("game.admin.monitor.pending")
                  : item.solved
                    ? t("game.admin.monitor.solved")
                    : t("game.admin.monitor.notSolved")}
              </span>
            </Tag>
            <span class="opacity-40">{item.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
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
          handleHttpError(err as Error, t("game.challenge.fetchHistoryFailed")!);
        }
        setLoading(false);
      });
    }
  });
  return (
    <>
      <h3 class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
        <span class="icon-[fluent--data-trending-20-regular] w-5 h-5 text-primary" />
        <span>{t("game.challenge.commitHistory")}</span>
      </h3>
      <Show when={loading()}>
        <div class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
          <LoadingTips />
        </div>
      </Show>
      <For each={history()}>
        {(item) => (
          <div class="w-full flex flex-row space-x-2 p-2 items-center border-b border-b-layer-content/10 overflow-hidden h-12">
            <span class="icon-[fluent--branch-request-20-regular] w-5 h-5 text-primary" />
            <span class="flex-1 truncate w-0">{item.subject}</span>
            <span class="font-bold">{item.author.name}</span>
            <span class="font-bold text-primary opacity-40">{item.abbreviated_commit}</span>
            <span class="opacity-40">{DateTime.fromSeconds(item.author.date).toFormat("yyyy-MM-dd HH:mm:ss")}</span>
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
            title={t("game.challenge.statisticsTips")}
          >
            <div class="flex flex-col py-2 items-start w-full">
              <span>{t("game.challenge.statistics")}</span>
              <span class="font-normal opacity-60 w-full text-start truncate">
                {t("game.challenge.statisticsTips")}
              </span>
            </div>
          </Button>
        </li>
        <li class="w-full">
          <Button
            ghost={tab() !== "history"}
            class="h-auto w-full"
            onClick={() => setTab("history")}
            title={t("game.challenge.commitHistoryTips")}
          >
            <div class="flex flex-col py-2 items-start w-full">
              <span>{t("game.challenge.commitHistory")}</span>
              <span class="font-normal opacity-60 w-full text-start truncate">
                {t("game.challenge.commitHistoryTips")}
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

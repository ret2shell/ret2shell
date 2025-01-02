import { handleHttpError } from "@api";
import { getGameAuditLogs, getGameSubmissions, updateGameAuditLog } from "@api/game";
import NarrowTips from "@blocks/narrow-tips";
import { type Audit, AuditState } from "@models/audit";
import type { Submission } from "@models/submission";
import { A, useSearchParams } from "@solidjs/router";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Tag from "@widgets/tag";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";

function AuditList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string)) || 1);
  const pageSize = 15;
  const [total, setTotal] = createSignal(0);
  const [audits, setAudits] = createSignal([] as Audit[]);
  const [loading, setLoading] = createSignal(false);
  async function refreshAudits() {
    setLoading(true);
    try {
      const resp = await getGameAuditLogs(gameStore.current!.id, page(), pageSize);
      setAudits(resp[0]);
      setTotal(resp[1]);
    } catch (err) {
      handleHttpError(err as Error, t("game.admin.monitor.fetchFailed")!);
    }
    setLoading(false);
  }
  createEffect(() => {
    if (gameStore.current && page()) {
      untrack(refreshAudits);
    }
  });
  const timer = setInterval(() => {
    refreshAudits();
  }, 5000);
  onCleanup(() => {
    clearInterval(timer);
  });
  async function handleMisjudged(audit: Audit) {
    try {
      await updateGameAuditLog(gameStore.current!.id, audit.id, {
        ...audit,
        state: AuditState.Misjudged,
      });
      refreshAudits();
      addToast({
        level: "success",
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("form.saveFailed")!);
    }
  }

  async function handleConfirmed(audit: Audit) {
    try {
      await updateGameAuditLog(gameStore.current!.id, audit.id, {
        ...audit,
        state: AuditState.Confirmed,
      });
      refreshAudits();
      addToast({
        level: "success",
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("form.saveFailed")!);
    }
  }
  return (
    <>
      <div class="flex-1 flex flex-col">
        <For
          each={audits()}
          fallback={
            <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
              <Show
                when={loading()}
                fallback={
                  <>
                    <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("game.team.noExtras")}</span>
                  </>
                }
              >
                <LoadingTips />
              </Show>
            </div>
          }
        >
          {(audit) => (
            <div class="h-12 flex flex-row space-x-2 px-2 border-b border-b-layer-content/10 items-center">
              <A class="font-bold" href={`/users/${audit.user_id}`}>
                {audit.user_name}
              </A>
              <span class="text-info opacity-60">@</span>
              <A class="font-bold opacity-60" href={`/games/${gameStore.current?.id}/teams/${audit.team_id}`}>
                {audit.team_name ?? "wheel"}
              </A>
              <span class="flex-1 w-0 truncate" title={audit.reason}>
                {audit.reason}
              </span>
              <A
                class="hover:underline flex space-x-2 items-center"
                href={`/games/${gameStore.current?.id}/challenges?challenge=${audit.challenge_id}`}
              >
                <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
                <span>{audit.challenge_name}</span>
              </A>
              <Tag
                level={
                  audit.state === AuditState.Pending
                    ? "warning"
                    : audit.state === AuditState.Misjudged
                      ? "layer-content"
                      : "error"
                }
              >
                <span>
                  {audit.state === AuditState.Pending
                    ? t("game.admin.monitor.needReview")
                    : audit.state === AuditState.Misjudged
                      ? t("game.admin.monitor.misjudged")
                      : t("game.admin.monitor.confirmed")}
                </span>
              </Tag>
              <Button
                size="sm"
                ghost
                square
                title={t("game.admin.monitor.misjudged")}
                level="success"
                onClick={() => handleMisjudged(audit)}
              >
                <span class="icon-[fluent--alert-snooze-20-regular] w-5 h-5" />
              </Button>
              <Button
                size="sm"
                ghost
                square
                title={t("game.admin.monitor.confirmed")}
                level="error"
                onClick={() => handleConfirmed(audit)}
              >
                <span class="icon-[fluent--emoji-angry-20-regular] w-5 h-5" />
              </Button>
              <span>{audit.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
            </div>
          )}
        </For>
      </div>
      <Pagination
        class="p-6 lg:p-9"
        count={total()}
        pageSize={pageSize}
        page={page()}
        onPageChange={(page) => setSearchParams({ page: page.page })}
      />
    </>
  );
}

function SubmissionList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string)) || 1);
  const pageSize = 15;
  const [total, setTotal] = createSignal(0);
  const [submissions, setSubmissions] = createSignal([] as Submission[]);
  const [loading, setLoading] = createSignal(false);
  async function refreshSubmissions() {
    setLoading(true);
    try {
      const resp = await getGameSubmissions(gameStore.current!.id, page(), pageSize);
      setSubmissions(resp[0]);
      setTotal(resp[1]);
    } catch (err) {
      handleHttpError(err as Error, t("game.admin.monitor.fetchFailed")!);
    }
    setLoading(false);
  }
  createEffect(() => {
    if (gameStore.current && page()) {
      untrack(refreshSubmissions);
    }
  });
  const timer = setInterval(() => {
    refreshSubmissions();
  }, 5000);
  onCleanup(() => {
    clearInterval(timer);
  });
  return (
    <>
      <div class="flex-1 flex flex-col">
        <For
          each={submissions()}
          fallback={
            <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
              <Show
                when={loading()}
                fallback={
                  <>
                    <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("game.team.noExtras")}</span>
                  </>
                }
              >
                <LoadingTips />
              </Show>
            </div>
          }
        >
          {(submission) => (
            <div class="h-12 flex flex-row space-x-2 px-2 border-b border-b-layer-content/10 items-center">
              <A class="font-bold" href={`/users/${submission.user_id}`}>
                {submission.user_name}
              </A>
              <span class="text-info opacity-60">@</span>
              <A class="font-bold opacity-60" href={`/games/${gameStore.current?.id}/teams/${submission.team_id}`}>
                {submission.team_name ?? "wheel"}
              </A>
              <span>{t("game.monitor.submit")}</span>
              <span class="flex-1 w-0 overflow-hidden flex items-center" title={submission.content!}>
                <span class="max-w-full truncate py-1 px-2 rounded-lg bg-layer-content/5">{submission.content}</span>
              </span>
              <A
                class="hover:underline flex space-x-2 items-center"
                href={`/games/${gameStore.current?.id}/challenges?challenge=${submission.challenge_id}`}
              >
                <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
                <span>{submission.challenge_name}</span>
              </A>
              <Tag level={submission.solved ? "success" : "warning"}>
                <span>
                  {submission.solved === null
                    ? t("game.admin.monitor.pending")
                    : submission.solved
                      ? t("game.admin.monitor.solved")
                      : t("game.admin.monitor.notSolved")}
                </span>
              </Tag>
              <span>{submission.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
            </div>
          )}
        </For>
      </div>
      <Pagination
        class="p-6 lg:p-9"
        count={total()}
        pageSize={pageSize}
        page={page()}
        onPageChange={(page) => setSearchParams({ page: page.page })}
      />
    </>
  );
}

export default function () {
  const [tab, setTab] = createSignal("submissions" as "submissions" | "audits");
  return (
    <>
      <Title page={t("game.admin.monitor.title")} route={`/games/${gameStore.current?.id}/admin/monitor`} />
      <div class="w-full p-3 lg:p-6 flex flex-col flex-1 relative">
        <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
          <span class="icon-[fluent--flash-flow-20-regular] w-5 h-5" />
          <span class="flex-1 text-start">{t("game.admin.monitor.title")}</span>
          <Tag level="success">
            <span>{t("game.monitor.autoRefreshEnabled")}</span>
          </Tag>
          <Button
            size="sm"
            ghost={tab() !== "submissions"}
            onClick={() => {
              setTab("submissions");
            }}
          >
            <span class="icon-[fluent--number-symbol-16-regular] w-4 h-4" />
            <span>{t("game.monitor.submissions")}</span>
          </Button>
          <Button
            size="sm"
            ghost={tab() !== "audits"}
            onClick={() => {
              setTab("audits");
            }}
          >
            <span class="icon-[fluent--alert-16-regular] w-4 h-4" />
            <span>{t("game.monitor.audits")}</span>
          </Button>
        </h3>
        <Switch>
          <Match when={tab() === "submissions"}>
            <SubmissionList />
          </Match>
          <Match when={tab() === "audits"}>
            <AuditList />
          </Match>
        </Switch>
        <NarrowTips breakpoint="xl" />
      </div>
    </>
  );
}

import { handleHttpError } from "@api";
import { getGameAuditLogs, getGameSubmissions, updateGameAuditLog } from "@api/game";
import { type Audit, AuditState } from "@models/audit";
import type { Submission } from "@models/submission";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useSearchParams } from "@solidjs/router";
import { gameStore } from "@storage/game";
import { breakpoints, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Tag from "@widgets/tag";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";

export function AuditList() {
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
      handleHttpError(err as Error, t("game.monitor.errors.fetchAudit.title")!);
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
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
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
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
  }
  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <div class="grid grid-cols-1 w-full">
        <For
          each={audits()}
          fallback={
            <div class="min-h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
              <Show
                when={loading()}
                fallback={
                  <>
                    <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("game.monitor.empty")}</span>
                  </>
                }
              >
                <LoadingTips />
              </Show>
            </div>
          }
        >
          {(audit) => (
            <div class="min-h-12 py-2 gap-y-2 px-2 border-b border-b-layer-content/10 flex flex-row flex-wrap justify-end space-x-2 items-center">
              <div class="flex flex-row">
                <span class="inline space-x-2 text-wrap">
                  <A class="font-bold" href={`/users/${audit.user_id}`}>
                    {audit.user_name}
                  </A>
                  <span class="text-info opacity-60">@</span>
                  <A class="font-bold opacity-60" href={`/games/${gameStore.current?.id}/teams/${audit.team_id}`}>
                    {audit.team_name ?? "wheel"}
                  </A>
                  <span title={audit.reason}>{audit.reason}</span>
                </span>
              </div>
              <span class="flex-1" />
              <div class="flex flex-row space-x-2 items-center flex-wrap">
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
                      ? t("game.monitor.status.pending.title")
                      : audit.state === AuditState.Misjudged
                        ? t("game.monitor.status.misjudged.title")
                        : t("game.monitor.status.confirmed.title")}
                  </span>
                </Tag>
              </div>
              <div class="gap-y-2 flex flex-row space-x-2 items-center flex-wrap justify-end">
                <Button
                  size="sm"
                  ghost
                  square
                  title={t("game.monitor.status.misjudged.title")}
                  level="success"
                  onClick={() => handleMisjudged(audit)}
                >
                  <span class="icon-[fluent--alert-snooze-20-regular] w-5 h-5" />
                </Button>
                <Button
                  size="sm"
                  ghost
                  square
                  title={t("game.monitor.status.confirmed.title")}
                  level="error"
                  onClick={() => handleConfirmed(audit)}
                >
                  <span class="icon-[fluent--emoji-angry-20-regular] w-5 h-5" />
                </Button>
                <span>
                  <Switch fallback={audit.created_at.toFormat("MM-dd HH:mm:ss")}>
                    <Match when={matches.xl}>{audit.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</Match>
                  </Switch>
                </span>
              </div>
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

export function SubmissionList(props: { inGame?: boolean }) {
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
      handleHttpError(err as Error, t("game.monitor.errors.fetchSubmission.title")!);
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
  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <div class="grid grid-cols-1 w-full">
        <For
          each={submissions()}
          fallback={
            <div class="min-h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
              <Show
                when={loading()}
                fallback={
                  <>
                    <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("game.monitor.empty")}</span>
                  </>
                }
              >
                <LoadingTips />
              </Show>
            </div>
          }
        >
          {(submission) => (
            <div class="min-h-12 py-2 gap-y-2 px-2 border-b border-b-layer-content/10 flex flex-row flex-wrap justify-end space-x-2 items-center">
              <div class="flex flex-row space-x-2 items-center overflow-hidden *:whitespace-nowrap mx-0">
                <A class="font-bold" href={`/users/${submission.user_id}`}>
                  {submission.user_name}
                </A>
                <Show when={props.inGame}>
                  <span class="text-info opacity-60">@</span>
                  <A class="font-bold opacity-60" href={`/games/${gameStore.current?.id}/teams/${submission.team_id}`}>
                    {submission.team_name ?? "wheel"}
                  </A>
                </Show>
                <span>{t("challenge.submission.submit")}</span>
                <span class="flex-1 truncate py-1 px-2 rounded-lg bg-layer-content/5" title={submission.content || ""}>
                  {submission.content}
                </span>
              </div>
              <span class="flex-1 mx-0" />
              <div class="gap-y-2 flex flex-row space-x-2 items-center flex-wrap justify-end">
                <A
                  class="hover:underline flex space-x-2 items-center"
                  href={
                    props.inGame
                      ? `/games/${gameStore.current?.id}/challenges?challenge=${submission.challenge_id}`
                      : `/training/${gameStore.current?.id}?challenge=${submission.challenge_id}`
                  }
                >
                  <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
                  <span>{submission.challenge_name}</span>
                </A>
                <Tag level={submission.solved === null ? "info" : submission.solved ? "success" : "warning"}>
                  <span>
                    {submission.solved === null
                      ? t("challenge.submission.status.pending.title")
                      : submission.solved
                        ? t("challenge.submission.status.solved.title")
                        : t("challenge.submission.status.failed.title")}
                  </span>
                </Tag>
                <span title={submission.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}>
                  <Switch fallback={submission.created_at.toFormat("MM-dd HH:mm:ss")}>
                    <Match when={matches.xl}>{submission.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</Match>
                  </Switch>
                </span>
              </div>
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

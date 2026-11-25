import { useGameAuditLogs, useGameSubmissions, useUpdateGameAuditLogMutation } from "@api/game";
import { type Audit, AuditState } from "@models/audit";
import { createBreakpoints } from "@solid-primitives/media";
import { useSearchParams } from "@solidjs/router";
import { breakpoints, t } from "@storage/theme";
import Button from "@widgets/button";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Tag from "@widgets/tag";
import { createMemo, For, Match, onCleanup, Show, Switch } from "solid-js";

export function AuditList(props: { gameId: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string, 10)) || 1);
  const pageSize = 15;
  const audits = useGameAuditLogs({
    game_id: () => props.gameId,
    page: () => page(),
    page_size: () => pageSize,
  });

  const auditMutation = useUpdateGameAuditLogMutation({
    onSuccess: () => {
      audits.refetch();
    },
  });

  const timer = setInterval(() => {
    audits.refetch();
  }, 5000);
  onCleanup(() => {
    clearInterval(timer);
  });
  async function handleMisjudged(audit: Audit) {
    auditMutation.mutate({
      game_id: props.gameId,
      audit_id: audit.id,
      audit: {
        ...audit,
        state: AuditState.Misjudged,
      },
    });
  }

  async function handleConfirmed(audit: Audit) {
    auditMutation.mutate({
      game_id: props.gameId,
      audit_id: audit.id,
      audit: {
        ...audit,
        state: AuditState.Confirmed,
      },
    });
  }
  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <div class="grid grid-cols-1 w-full">
        <For
          each={audits.data?.[0] || []}
          fallback={
            <div class="min-h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
              <Show
                when={audits.isLoading}
                fallback={
                  <>
                    <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
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
                  <a class="font-bold" href={`/users/${audit.user_id}`}>
                    {audit.user_name}
                  </a>
                  <span class="text-info opacity-60">@</span>
                  <a class="font-bold opacity-60" href={`/games/${props.gameId}/teams/${audit.team_id}`}>
                    {audit.team_name ?? "wheel"}
                  </a>
                  <span title={audit.reason}>{audit.reason}</span>
                </span>
              </div>
              <span class="flex-1" />
              <div class="flex flex-row space-x-2 items-center flex-wrap">
                <a
                  class="hover:underline flex space-x-2 items-center"
                  href={`/games/${props.gameId}/challenges?challenge=${audit.challenge_id}`}
                >
                  <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
                  <span>{audit.challenge_name}</span>
                </a>
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
                  <span class="shrink-0 icon-[fluent--alert-snooze-20-regular] w-5 h-5" />
                </Button>
                <Button
                  size="sm"
                  ghost
                  square
                  title={t("game.monitor.status.confirmed.title")}
                  level="error"
                  onClick={() => handleConfirmed(audit)}
                >
                  <span class="shrink-0 icon-[fluent--emoji-angry-20-regular] w-5 h-5" />
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
        count={audits.data?.[1] || 0}
        pageSize={pageSize}
        page={page()}
        onPageChange={(page) => setSearchParams({ page: page.page })}
      />
    </>
  );
}

export function SubmissionList(props: { training?: boolean; archived?: boolean; gameId: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string, 10)) || 1);
  const pageSize = 15;
  const submissions = useGameSubmissions({
    game_id: () => props.gameId,
    page: () => page(),
    page_size: () => pageSize,
  });
  const timer = setInterval(() => {
    submissions.refetch();
  }, 5000);
  onCleanup(() => {
    clearInterval(timer);
  });
  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <div class="grid grid-cols-1 w-full">
        <For
          each={submissions.data?.[0] || []}
          fallback={
            <div class="min-h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
              <Show
                when={submissions.isLoading}
                fallback={
                  <>
                    <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
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
                <a class="font-bold" href={`/users/${submission.user_id}`}>
                  {submission.user_name}
                </a>
                <Show when={!props.training}>
                  <span class="text-info opacity-60">@</span>
                  <a class="font-bold opacity-60" href={`/games/${props.gameId}/teams/${submission.team_id}`}>
                    {submission.team_name ?? "wheel"}
                  </a>
                </Show>
                <span>{t("challenge.submission.submit")}</span>
                <span class="flex-1 truncate py-1 px-2 rounded-lg bg-layer-content/5" title={submission.content || ""}>
                  {submission.content}
                </span>
              </div>
              <div class="flex flex-row space-x-2 items-center overflow-hidden *:whitespace-nowrap mx-0">
                <span>&nbsp;=&gt;</span>
                <span class="flex-1 truncate py-1 px-2 rounded-lg bg-layer-content/5" title={submission.result || ""}>
                  {submission.result}
                </span>
              </div>
              <span class="flex-1 mx-0" />
              <div class="gap-y-2 flex flex-row space-x-2 items-center flex-wrap justify-end">
                <a
                  class="hover:underline flex space-x-2 items-center"
                  href={
                    props.training || props.archived
                      ? `/training/${props.gameId}?challenge=${submission.challenge_id}`
                      : `/games/${props.gameId}/challenges?challenge=${submission.challenge_id}`
                  }
                >
                  <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
                  <span>{submission.challenge_name}</span>
                </a>
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
        count={submissions.data?.[1] || 0}
        pageSize={pageSize}
        page={page()}
        onPageChange={(page) => setSearchParams({ page: page.page })}
      />
    </>
  );
}

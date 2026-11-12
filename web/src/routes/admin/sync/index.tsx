import {
  useDeleteSyncSourceMutation,
  useSyncSources,
  useTriggerSyncJobMutation,
  useUpdateSyncSourceMutation,
} from "@api/sync";
import type { SyncSource } from "@models/sync";
import { shortOid } from "@models/sync";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Dialog from "@widgets/dialog";
import LoadingTips from "@widgets/loading-tips";
import Popover from "@widgets/popover";
import Tag from "@widgets/tag";
import { createSignal, For, Show } from "solid-js";
import { describeSyncError, formatSyncTime, syncStatusLevel, syncStatusText } from "./_blocks/display";
import JobsDialog from "./_blocks/jobs-dialog";
import SourceForm from "./_blocks/source-form";

export default function () {
  const sources = useSyncSources();
  const updateMutation = useUpdateSyncSourceMutation({ onSuccess: () => sources.refetch() });
  const deleteMutation = useDeleteSyncSourceMutation({ onSuccess: () => sources.refetch() });
  const triggerMutation = useTriggerSyncJobMutation();

  const [creationFormOpen, setCreationFormOpen] = createSignal(false);
  const [jobsSource, setJobsSource] = createSignal<SyncSource | null>(null);
  const [jobsSelected, setJobsSelected] = createSignal<number | null>(null);
  const [jobsOpen, setJobsOpen] = createSignal(false);

  function openJobs(source: SyncSource, jobId?: number) {
    setJobsSource(source);
    setJobsSelected(jobId ?? null);
    setJobsOpen(true);
  }

  function syncNow(source: SyncSource) {
    triggerMutation.mutate(source.id, {
      onSuccess: (jobId) => openJobs(source, jobId),
    });
  }

  function toggleEnabled(source: SyncSource) {
    updateMutation.mutate({ id: source.id, req: { enabled: !source.enabled } });
  }

  function intervalText(source: SyncSource): string {
    return source.interval_seconds
      ? t("platform.sync.list.intervalSeconds", { seconds: source.interval_seconds })
      : t("platform.sync.list.manual");
  }

  function gameText(source: SyncSource): string {
    return source.local_game_name ?? `#${source.local_game_id}`;
  }

  return (
    <>
      <Title page={t("platform.sync.title")} route="/admin/sync" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <div class="w-full max-w-5xl flex flex-col">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--cloud-sync-20-regular] w-5 h-5" />
            <span class="flex-1 text-start">{t("platform.sync.title")}</span>
            <Button
              square
              ghost
              type="button"
              title={t("general.actions.refresh.title")}
              onClick={() => sources.refetch()}
            >
              <span class="shrink-0 icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />
            </Button>
            <Dialog
              level="primary"
              size="sm"
              title={t("platform.sync.form.createTitle")}
              btnContent={
                <>
                  <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
                  <span>{t("platform.sync.form.createTitle")}</span>
                </>
              }
              open={creationFormOpen()}
              onOpenChange={(detail) => setCreationFormOpen(detail.open)}
            >
              <SourceForm
                onDone={() => {
                  setCreationFormOpen(false);
                  sources.refetch();
                }}
              />
            </Dialog>
          </h3>
          <p class="text-sm opacity-60 py-2">{t("platform.sync.subtitle")}</p>
          <Show
            when={!sources.isLoading}
            fallback={
              <div class="flex items-center justify-center p-6">
                <LoadingTips />
              </div>
            }
          >
            <Show
              when={(sources.data?.length ?? 0) > 0}
              fallback={
                <div class="flex flex-col items-center space-y-2 p-6 opacity-60">
                  <span class="shrink-0 icon-[fluent--cloud-off-20-regular] w-8 h-8" />
                  <span>{t("platform.sync.list.empty")}</span>
                </div>
              }
            >
              <For each={sources.data}>
                {(source) => {
                  const [editFormOpen, setEditFormOpen] = createSignal(false);
                  const error = () =>
                    describeSyncError(source.last_status === "failed" ? source.last_error : null, null);
                  return (
                    <Card class="my-2">
                      <Card contentClass="p-2 lg:p-3 flex flex-col space-y-2">
                        <div class="flex items-center space-x-2 min-w-0">
                          <Tag level={syncStatusLevel(source.last_status)}>{syncStatusText(source.last_status)}</Tag>
                          <span class="flex-1 text-start truncate font-mono text-sm" title={source.repository_url}>
                            {source.repository_url}
                          </span>
                          <Tag level={source.enabled ? "success" : "layer-content"}>
                            {source.enabled ? t("platform.sync.list.enabled") : t("platform.sync.list.disabled")}
                          </Tag>
                        </div>
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                          <span class="opacity-70">{t("platform.sync.list.game")}</span>
                          <span class="truncate" title={gameText(source)}>
                            {gameText(source)}
                          </span>
                          <span class="opacity-70">{t("platform.sync.list.interval")}</span>
                          <span>{intervalText(source)}</span>
                          <span class="opacity-70">{t("platform.sync.list.lastSuccess")}</span>
                          <span>{formatSyncTime(source.last_success_at)}</span>
                          <span class="opacity-70">{t("platform.sync.list.lastAttempt")}</span>
                          <span>{formatSyncTime(source.last_attempt_at)}</span>
                          <span class="opacity-70">{t("platform.sync.list.nextSync")}</span>
                          <span>{formatSyncTime(source.next_sync_at)}</span>
                          <span class="opacity-70">{t("platform.sync.list.oid")}</span>
                          <span class="font-mono" title={source.last_synced_oid ?? undefined}>
                            {shortOid(source.last_synced_oid)}
                          </span>
                        </div>
                        <Show when={source.consecutive_failures > 0}>
                          <div class="text-warning text-sm flex items-center space-x-2">
                            <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
                            <span>
                              {t("platform.sync.list.failures", {
                                count: source.consecutive_failures,
                              })}
                            </span>
                          </div>
                        </Show>
                        <Show when={source.last_status === "failed"}>
                          <div class="text-error text-sm flex flex-col space-y-1">
                            <div class="flex items-center space-x-2">
                              <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
                              <span class="font-bold">{error().title}</span>
                            </div>
                            <Show when={error().hint}>
                              <span class="opacity-80">{error().hint}</span>
                            </Show>
                          </div>
                        </Show>
                        <div class="flex items-center space-x-1">
                          <Button
                            size="sm"
                            level="primary"
                            type="button"
                            loading={triggerMutation.isPending}
                            disabled={triggerMutation.isPending}
                            onClick={() => syncNow(source)}
                          >
                            <span class="shrink-0 icon-[fluent--sync-20-regular] w-5 h-5" />
                            <span>{t("platform.sync.actions.sync.title")}</span>
                          </Button>
                          <Button size="sm" type="button" onClick={() => openJobs(source)}>
                            <span class="shrink-0 icon-[fluent--task-list-ltr-20-regular] w-5 h-5" />
                            <span>{t("platform.sync.actions.jobs")}</span>
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            loading={updateMutation.isPending}
                            disabled={updateMutation.isPending}
                            onClick={() => toggleEnabled(source)}
                          >
                            <span
                              class={
                                source.enabled
                                  ? "shrink-0 icon-[fluent--pause-20-regular] w-5 h-5"
                                  : "shrink-0 icon-[fluent--play-20-regular] w-5 h-5"
                              }
                            />
                            <span>
                              {source.enabled ? t("platform.sync.actions.pause") : t("platform.sync.actions.resume")}
                            </span>
                          </Button>
                          <span class="flex-1" />
                          <Dialog
                            ghost
                            size="sm"
                            square
                            title={t("general.actions.edit.title")}
                            btnContent={<span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />}
                            open={editFormOpen()}
                            onOpenChange={(detail) => setEditFormOpen(detail.open)}
                          >
                            <SourceForm
                              source={source}
                              onDone={() => {
                                setEditFormOpen(false);
                                sources.refetch();
                              }}
                            />
                          </Dialog>
                          <Popover
                            size="sm"
                            ghost
                            square
                            title={t("platform.sync.actions.unbind.title")}
                            btnContent={<span class="shrink-0 icon-[fluent--link-dismiss-20-regular] w-5 h-5" />}
                          >
                            <Card contentClass="p-2 flex flex-col space-y-2 items-start">
                              <span class="text-start">{t("platform.sync.warnings.unbind")}</span>
                              <Button
                                level="error"
                                size="sm"
                                title={t("general.actions.confirm.title")}
                                loading={deleteMutation.isPending}
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(source.id)}
                              >
                                <span>{t("general.actions.confirm.title")}</span>
                              </Button>
                            </Card>
                          </Popover>
                        </div>
                      </Card>
                    </Card>
                  );
                }}
              </For>
            </Show>
          </Show>
          <div class="h-12" />
        </div>
      </div>
      <JobsDialog
        source={jobsSource}
        selectedJobId={jobsSelected}
        open={jobsOpen}
        onOpenChange={setJobsOpen}
        onSelectJob={setJobsSelected}
      />
    </>
  );
}

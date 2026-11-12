import {
  useDeleteSyncDistributionMutation,
  useSyncDistributions,
  useTriggerSyncJobMutation,
  useUnbindSyncDistributionMutation,
  useUpdateSyncDistributionMutation,
} from "@api/sync";
import type { SyncDistribution } from "@models/sync";
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
import CommunityPanel from "./_blocks/community-panel";
import { describeSyncError, formatSyncTime, syncStatusLevel, syncStatusText } from "./_blocks/display";
import DistributionForm from "./_blocks/distribution-form";
import JobsDialog from "./_blocks/jobs-dialog";

export default function () {
  const distributions = useSyncDistributions();
  const updateMutation = useUpdateSyncDistributionMutation({
    onSuccess: () => distributions.refetch(),
  });
  const unbindMutation = useUnbindSyncDistributionMutation({
    onSuccess: () => distributions.refetch(),
  });
  const deleteMutation = useDeleteSyncDistributionMutation({
    onSuccess: () => distributions.refetch(),
  });
  const triggerMutation = useTriggerSyncJobMutation();

  const [creationFormOpen, setCreationFormOpen] = createSignal(false);
  const [creationMode, setCreationMode] = createSignal<"direct" | "community">("direct");
  const [jobsDistribution, setJobsDistribution] = createSignal<SyncDistribution | null>(null);
  const [jobsSelected, setJobsSelected] = createSignal<number | null>(null);
  const [jobsOpen, setJobsOpen] = createSignal(false);

  function openJobs(distribution: SyncDistribution, jobId?: number) {
    setJobsDistribution(distribution);
    setJobsSelected(jobId ?? null);
    setJobsOpen(true);
  }

  function syncNow(distribution: SyncDistribution) {
    triggerMutation.mutate(distribution.id, {
      onSuccess: (jobId) => openJobs(distribution, jobId),
    });
  }

  function toggleEnabled(distribution: SyncDistribution) {
    updateMutation.mutate({ id: distribution.id, req: { enabled: !distribution.enabled } });
  }

  function intervalText(distribution: SyncDistribution): string {
    return distribution.interval_seconds
      ? t("platform.sync.list.intervalSeconds", { seconds: distribution.interval_seconds })
      : t("platform.sync.list.manual");
  }

  function gameText(distribution: SyncDistribution): string {
    return distribution.managed_game_id
      ? (distribution.managed_game_name ?? `#${distribution.managed_game_id}`)
      : t("platform.sync.list.unbound");
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
              onClick={() => distributions.refetch()}
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
              <div class="flex flex-col space-y-2">
                <div class="flex items-center space-x-1">
                  <Button
                    size="sm"
                    type="button"
                    level={creationMode() === "direct" ? "primary" : null}
                    onClick={() => setCreationMode("direct")}
                  >
                    <span>{t("platform.sync.tabs.direct")}</span>
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    level={creationMode() === "community" ? "primary" : null}
                    onClick={() => setCreationMode("community")}
                  >
                    <span>{t("platform.sync.tabs.community")}</span>
                  </Button>
                </div>
                <Show
                  when={creationMode() === "direct"}
                  fallback={
                    <CommunityPanel
                      onDone={() => {
                        setCreationFormOpen(false);
                        distributions.refetch();
                      }}
                    />
                  }
                >
                  <DistributionForm
                    onDone={() => {
                      setCreationFormOpen(false);
                      distributions.refetch();
                    }}
                  />
                </Show>
              </div>
            </Dialog>
          </h3>
          <p class="text-sm opacity-60 py-2">{t("platform.sync.subtitle")}</p>
          <Show
            when={!distributions.isLoading}
            fallback={
              <div class="flex items-center justify-center p-6">
                <LoadingTips />
              </div>
            }
          >
            <Show
              when={(distributions.data?.length ?? 0) > 0}
              fallback={
                <div class="flex flex-col items-center space-y-2 p-6 opacity-60">
                  <span class="shrink-0 icon-[fluent--cloud-off-20-regular] w-8 h-8" />
                  <span>{t("platform.sync.list.empty")}</span>
                </div>
              }
            >
              <For each={distributions.data}>
                {(distribution) => {
                  const [editFormOpen, setEditFormOpen] = createSignal(false);
                  const error = () =>
                    describeSyncError(distribution.last_status === "failed" ? distribution.last_error : null, null);
                  return (
                    <Card class="my-2">
                      <Card contentClass="p-2 lg:p-3 flex flex-col space-y-2">
                        <div class="flex items-center space-x-2 min-w-0">
                          <Tag level={syncStatusLevel(distribution.last_status)}>
                            {syncStatusText(distribution.last_status)}
                          </Tag>
                          <span class="flex-1 text-start truncate font-mono text-sm" title={distribution.endpoint}>
                            {distribution.endpoint}
                          </span>
                          <Show when={distribution.registry_url}>
                            <Tag level="info">{t("platform.sync.list.community")}</Tag>
                          </Show>
                          <Tag level={distribution.enabled ? "success" : "layer-content"}>
                            {distribution.enabled ? t("platform.sync.list.enabled") : t("platform.sync.list.disabled")}
                          </Tag>
                        </div>
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                          <span class="opacity-70">{t("platform.sync.list.bucketId")}</span>
                          <span class="truncate font-mono" title={distribution.bucket_id}>
                            {distribution.bucket_id}
                          </span>
                          <span class="opacity-70">{t("platform.sync.list.game")}</span>
                          <span class="truncate" title={gameText(distribution)}>
                            {gameText(distribution)}
                          </span>
                          <span class="opacity-70">{t("platform.sync.list.headRef")}</span>
                          <span class="font-mono" title={distribution.head_ref}>
                            {shortOid(distribution.head_ref)}
                          </span>
                          <span class="opacity-70">{t("platform.sync.list.interval")}</span>
                          <span>{intervalText(distribution)}</span>
                          <span class="opacity-70">{t("platform.sync.list.lastSuccess")}</span>
                          <span>{formatSyncTime(distribution.last_success_at)}</span>
                          <span class="opacity-70">{t("platform.sync.list.lastAttempt")}</span>
                          <span>{formatSyncTime(distribution.last_attempt_at)}</span>
                          <span class="opacity-70">{t("platform.sync.list.nextSync")}</span>
                          <span>{formatSyncTime(distribution.next_sync_at)}</span>
                          <span class="opacity-70">{t("platform.sync.list.oid")}</span>
                          <span class="font-mono" title={distribution.last_synced_oid ?? undefined}>
                            {shortOid(distribution.last_synced_oid)}
                          </span>
                        </div>
                        <Show when={distribution.consecutive_failures > 0}>
                          <div class="text-warning text-sm flex items-center space-x-2">
                            <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
                            <span>
                              {t("platform.sync.list.failures", {
                                count: distribution.consecutive_failures,
                              })}
                            </span>
                          </div>
                        </Show>
                        <Show when={distribution.last_status === "failed"}>
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
                            disabled={triggerMutation.isPending || !distribution.managed_game_id}
                            title={distribution.managed_game_id ? undefined : t("platform.sync.actions.sync.noGame")}
                            onClick={() => syncNow(distribution)}
                          >
                            <span class="shrink-0 icon-[fluent--sync-20-regular] w-5 h-5" />
                            <span>{t("platform.sync.actions.sync.title")}</span>
                          </Button>
                          <Button size="sm" type="button" onClick={() => openJobs(distribution)}>
                            <span class="shrink-0 icon-[fluent--task-list-ltr-20-regular] w-5 h-5" />
                            <span>{t("platform.sync.actions.jobs")}</span>
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            loading={updateMutation.isPending}
                            disabled={updateMutation.isPending}
                            onClick={() => toggleEnabled(distribution)}
                          >
                            <span
                              class={
                                distribution.enabled
                                  ? "shrink-0 icon-[fluent--pause-20-regular] w-5 h-5"
                                  : "shrink-0 icon-[fluent--play-20-regular] w-5 h-5"
                              }
                            />
                            <span>
                              {distribution.enabled
                                ? t("platform.sync.actions.pause")
                                : t("platform.sync.actions.resume")}
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
                            <DistributionForm
                              distribution={distribution}
                              onDone={() => {
                                setEditFormOpen(false);
                                distributions.refetch();
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
                                level="warning"
                                size="sm"
                                title={t("general.actions.confirm.title")}
                                loading={unbindMutation.isPending}
                                disabled={unbindMutation.isPending || !distribution.managed_game_id}
                                onClick={() => unbindMutation.mutate(distribution.id)}
                              >
                                <span>{t("general.actions.confirm.title")}</span>
                              </Button>
                            </Card>
                          </Popover>
                          <Popover
                            size="sm"
                            ghost
                            square
                            title={t("platform.sync.actions.delete.title")}
                            btnContent={<span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />}
                          >
                            <Card contentClass="p-2 flex flex-col space-y-2 items-start">
                              <span class="text-start">{t("platform.sync.warnings.delete")}</span>
                              <Button
                                level="error"
                                size="sm"
                                title={t("general.actions.confirm.title")}
                                loading={deleteMutation.isPending}
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(distribution.id)}
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
        distribution={jobsDistribution}
        selectedJobId={jobsSelected}
        open={jobsOpen}
        onOpenChange={setJobsOpen}
        onSelectJob={setJobsSelected}
      />
    </>
  );
}

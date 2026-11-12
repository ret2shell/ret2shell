import { useSyncJob, useSyncJobs, useTriggerSyncJobMutation } from "@api/sync";
import { isRunningStatus, type SyncJob, type SyncSource, shortOid } from "@models/sync";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Dialog from "@widgets/dialog";
import Tag from "@widgets/tag";
import { For, Show } from "solid-js";
import { describeSyncError, formatSyncTime, syncStatusLevel, syncStatusText, syncTriggerText } from "./display";

/**
 * Job history and live log panel for one sync source. While any listed job is
 * queued or running both the list and the selected job detail poll every 3
 * seconds (wired in the query hooks), so the panel follows the job until it
 * settles without manual refreshes.
 */
export default function JobsDialog(props: {
  source: () => SyncSource | null;
  selectedJobId: () => number | null;
  open: () => boolean;
  onOpenChange: (open: boolean) => void;
  onSelectJob: (jobId: number | null) => void;
}) {
  const sourceId = () => props.source()?.id ?? 0;
  const jobs = useSyncJobs({ sourceId, enabled: props.open });
  const jobId = () => props.selectedJobId() ?? 0;
  const job = useSyncJob({
    jobId,
    enabled: () => props.open() && jobId() > 0,
  });
  const triggerMutation = useTriggerSyncJobMutation({
    onSuccess: (id) => {
      props.onSelectJob(id);
      jobs.refetch();
    },
  });

  function jobOids(job: SyncJob): string {
    if (!job.old_oid && !job.new_oid) {
      return "-";
    }
    return `${shortOid(job.old_oid)} -> ${shortOid(job.new_oid)}`;
  }

  return (
    <Dialog
      class="hidden"
      title={t("platform.sync.jobs.title")}
      btnContent={<span />}
      open={props.open()}
      onOpenChange={(detail) => props.onOpenChange(detail.open)}
    >
      <div class="w-screen max-w-3xl flex flex-col space-y-3">
        <h3 class="flex items-center space-x-2 font-bold">
          <span class="shrink-0 icon-[fluent--task-list-ltr-20-regular] w-5 h-5" />
          <span class="flex-1 text-start truncate" title={props.source()?.repository_url}>
            {props.source()?.repository_url}
          </span>
        </h3>
        <Show
          when={!jobs.isLoading}
          fallback={<span class="text-sm opacity-60">{t("platform.sync.jobs.loading")}</span>}
        >
          <Show
            when={(jobs.data?.length ?? 0) > 0}
            fallback={<span class="text-sm opacity-60">{t("platform.sync.jobs.empty")}</span>}
          >
            <div class="max-h-56 flex flex-col overflow-y-auto">
              <For each={jobs.data}>
                {(item) => (
                  <button
                    type="button"
                    class="w-full flex items-center space-x-2 px-2 h-10 border-b border-b-layer-content/10 cursor-pointer hover:bg-layer/50 text-sm text-start"
                    classList={{ "bg-layer/70": props.selectedJobId() === item.id }}
                    onClick={() => props.onSelectJob(item.id)}
                  >
                    <span class="w-14 shrink-0 text-start font-mono">#{item.id}</span>
                    <Tag level={syncStatusLevel(item.status)}>{syncStatusText(item.status)}</Tag>
                    <span class="w-16 shrink-0 text-start opacity-70">{syncTriggerText(item.trigger)}</span>
                    <span class="flex-1 text-start font-mono truncate" title={jobOids(item)}>
                      {jobOids(item)}
                    </span>
                    <span class="shrink-0 opacity-70">{formatSyncTime(item.created_at)}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
        <Show when={job.data}>
          {(detail) => (
            <Card contentClass="p-2 lg:p-3 flex flex-col space-y-2">
              <div class="flex items-center space-x-2">
                <span class="font-mono font-bold">#{detail().id}</span>
                <Tag level={syncStatusLevel(detail().status)}>{syncStatusText(detail().status)}</Tag>
                <span class="flex-1" />
                <Show when={detail().status === "failed"}>
                  <Button
                    size="sm"
                    level="warning"
                    loading={triggerMutation.isPending}
                    disabled={triggerMutation.isPending}
                    onClick={() => triggerMutation.mutate(sourceId())}
                  >
                    <span class="shrink-0 icon-[fluent--arrow-counterclockwise-20-regular] w-5 h-5" />
                    <span>{t("platform.sync.jobs.retry")}</span>
                  </Button>
                </Show>
              </div>
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-1 text-sm">
                <span class="opacity-70">{t("platform.sync.jobs.trigger")}</span>
                <span>{syncTriggerText(detail().trigger)}</span>
                <span class="opacity-70">{t("platform.sync.jobs.oids")}</span>
                <span class="font-mono">{jobOids(detail())}</span>
                <span class="opacity-70">{t("platform.sync.jobs.created")}</span>
                <span>{formatSyncTime(detail().created_at)}</span>
                <span class="opacity-70">{t("platform.sync.jobs.started")}</span>
                <span>{formatSyncTime(detail().started_at)}</span>
                <span class="opacity-70">{t("platform.sync.jobs.finished")}</span>
                <span>{formatSyncTime(detail().finished_at)}</span>
                <Show when={detail().trace_id}>
                  <span class="opacity-70">{t("platform.sync.jobs.trace")}</span>
                  <span class="font-mono truncate">{detail().trace_id}</span>
                </Show>
              </div>
              <Show when={detail().status === "failed"}>
                <div class="text-error text-sm flex flex-col space-y-1">
                  <div class="flex items-center space-x-2">
                    <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
                    <span class="font-bold">
                      {describeSyncError(detail().error_code, detail().error_message).title}
                    </span>
                  </div>
                  <span class="opacity-80">{describeSyncError(detail().error_code, detail().error_message).hint}</span>
                </div>
              </Show>
              <div>
                <h4 class="font-bold text-sm space-x-2 flex items-center">
                  <span class="shrink-0 icon-[fluent--window-console-20-regular] w-5 h-5" />
                  <span>{t("platform.sync.jobs.log")}</span>
                  <Show when={isRunningStatus(detail().status)}>
                    <span class="shrink-0 icon-[fluent--loading-20-regular] w-4 h-4 animate-spin" />
                  </Show>
                </h4>
                <pre class="text-xs font-mono whitespace-pre-wrap max-h-72 overflow-auto m-0 mt-2">
                  {detail().log || t("platform.sync.jobs.noLog")}
                </pre>
              </div>
            </Card>
          )}
        </Show>
      </div>
    </Dialog>
  );
}

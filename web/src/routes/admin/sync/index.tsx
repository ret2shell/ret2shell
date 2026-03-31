import {
  type SyncRegistrySourcePayload,
  useCancelSyncJobMutation,
  useCatalogGames,
  useCatalogReleaseDetail,
  useCatalogReleases,
  useCreateSyncSourceMutation,
  useDeleteSyncSourceMutation,
  useDiscoverDirectSyncMutation,
  useFetchSyncSourceMutation,
  useImportCatalogSyncMutation,
  useImportDirectSyncMutation,
  useResumeSyncJobMutation,
  useSyncJob,
  useSyncJobs,
  useSyncSources,
  useUpdateSyncSourceMutation,
} from "@api/sync";
import type { DirectDiscoverResponse, SyncJob, SyncJobDetail, SyncRegistrySource } from "@models/sync";
import { useNavigate } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Checkbox from "@widgets/checkbox";
import Input from "@widgets/input";
import Select from "@widgets/select";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

const EMPTY_FORM: SyncRegistrySourcePayload = {
  name: "",
  git_url: "",
  branch: "main",
  enabled: true,
  priority: 0,
};

export default function () {
  const navigate = useNavigate();
  const sources = useSyncSources();
  const jobs = useSyncJobs();
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [form, setForm] = createSignal<SyncRegistrySourcePayload>({ ...EMPTY_FORM });
  const [discoverBaseUrl, setDiscoverBaseUrl] = createSignal("");
  const [discoverSyncToken, setDiscoverSyncToken] = createSignal("");
  const [discoverGameKey, setDiscoverGameKey] = createSignal("");
  const [discoverReleaseId, setDiscoverReleaseId] = createSignal("");
  const [discoverResult, setDiscoverResult] = createSignal<DirectDiscoverResponse | null>(null);
  const [catalogSourceId, setCatalogSourceId] = createSignal<number | null>(null);
  const [catalogGameKey, setCatalogGameKey] = createSignal<string | null>(null);
  const [catalogReleaseId, setCatalogReleaseId] = createSignal<string | null>(null);
  const [catalogUpstreamInstanceId, setCatalogUpstreamInstanceId] = createSignal<string | null>(null);
  const [selectedJobId, setSelectedJobId] = createSignal<number | null>(null);
  const [actionJobId, setActionJobId] = createSignal<number | null>(null);
  const catalogGames = useCatalogGames({ source_id: catalogSourceId, enabled: () => catalogSourceId() != null });
  const catalogReleases = useCatalogReleases({
    source_id: catalogSourceId,
    game_key: catalogGameKey,
    enabled: () => catalogSourceId() != null && !!catalogGameKey(),
  });
  const catalogDetail = useCatalogReleaseDetail({
    source_id: catalogSourceId,
    game_key: catalogGameKey,
    release_id: catalogReleaseId,
    enabled: () => catalogSourceId() != null && !!catalogGameKey() && !!catalogReleaseId(),
  });
  const selectedJob = useSyncJob({
    job_id: selectedJobId,
    enabled: () => selectedJobId() != null,
  });

  const createMutation = useCreateSyncSourceMutation({
    onSuccess: () => {
      sources.refetch();
      resetForm();
    },
  });
  const updateMutation = useUpdateSyncSourceMutation({
    onSuccess: () => {
      sources.refetch();
      resetForm();
    },
  });
  const deleteMutation = useDeleteSyncSourceMutation({
    onSuccess: () => {
      sources.refetch();
      if (editingId() != null && !sources.data?.find((source) => source.id === editingId())) {
        resetForm();
      }
    },
  });
  const fetchMutation = useFetchSyncSourceMutation({
    onSuccess: () => {
      sources.refetch();
    },
  });
  const discoverMutation = useDiscoverDirectSyncMutation({
    onSuccess: (data) => {
      setDiscoverResult(data);
    },
  });
  const importMutation = useImportDirectSyncMutation({
    onSuccess: (data) => {
      setSelectedJobId(data.id);
      jobs.refetch();
    },
  });
  const importCatalogMutation = useImportCatalogSyncMutation({
    onSuccess: (data) => {
      setSelectedJobId(data.id);
      jobs.refetch();
    },
  });
  const resumeJobMutation = useResumeSyncJobMutation({
    onSuccess: (data) => {
      setSelectedJobId(data.id);
      jobs.refetch();
      selectedJob.refetch();
    },
  });
  const cancelJobMutation = useCancelSyncJobMutation({
    onSuccess: (data) => {
      setSelectedJobId(data.id);
      jobs.refetch();
      selectedJob.refetch();
    },
  });

  createEffect(() => {
    const interval = window.setInterval(() => {
      if (jobs.data?.some((job) => job.status === "pending" || job.status === "running")) {
        jobs.refetch();
        if (selectedJobId() != null) {
          selectedJob.refetch();
        }
      }
    }, 2000);
    onCleanup(() => window.clearInterval(interval));
  });

  createEffect(() => {
    const currentJobs = jobs.data || [];
    if (!currentJobs.length) {
      if (selectedJobId() != null) {
        setSelectedJobId(null);
      }
      return;
    }
    if (selectedJobId() == null || !currentJobs.some((job) => job.id === selectedJobId())) {
      setSelectedJobId(currentJobs[0].id);
    }
  });

  createEffect(() => {
    if (catalogSourceId() != null || !sources.data?.length) {
      return;
    }
    const source = sources.data.find((item) => item.enabled) ?? sources.data[0];
    if (source) {
      setCatalogSourceId(source.id);
    }
  });

  const isEditing = createMemo(() => editingId() != null);

  function updateForm<K extends keyof SyncRegistrySourcePayload>(key: K, value: SyncRegistrySourcePayload[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function beginEdit(source: SyncRegistrySource) {
    setEditingId(source.id);
    setForm({
      name: source.name,
      git_url: source.git_url,
      branch: source.branch,
      enabled: source.enabled,
      priority: source.priority,
    });
  }

  function onSubmit() {
    if (!form().name.trim() || !form().git_url.trim() || !form().branch.trim()) {
      return;
    }
    if (isEditing()) {
      updateMutation.mutate({ id: editingId()!, source: form() });
    } else {
      createMutation.mutate(form());
    }
  }

  function onDiscover() {
    discoverMutation.mutate({
      base_url: discoverBaseUrl(),
      sync_token: discoverSyncToken() || null,
      game_key: discoverGameKey() || null,
      release_id: discoverReleaseId() || null,
    });
  }

  function onImport() {
    if (!discoverGameKey().trim() || !discoverReleaseId().trim()) {
      return;
    }
    importMutation.mutate({
      base_url: discoverBaseUrl(),
      sync_token: discoverSyncToken() || null,
      game_key: discoverGameKey().trim(),
      release_id: discoverReleaseId().trim(),
    });
  }

  function openImportedGame(job: SyncJob) {
    if (job.game_id != null) {
      navigate(`/games/${job.game_id}/admin/sync`);
    }
  }

  function runResumeJob(job: SyncJob) {
    setActionJobId(job.id);
    resumeJobMutation.mutate({ job_id: job.id });
  }

  function runCancelJob(job: SyncJob) {
    setActionJobId(job.id);
    cancelJobMutation.mutate({ job_id: job.id });
  }

  function jobStatusLabel(status: SyncJob["status"]) {
    return t(`platform.sync.jobs.status.${status}`);
  }

  function jobModeLabel(mode: SyncJob["mode"]) {
    switch (mode) {
      case "direct":
        return t("platform.sync.direct.title");
      case "registry":
        return t("platform.sync.catalog.title");
    }
  }

  function jobResumeLabel(job: Pick<SyncJob, "status">) {
    return job.status === "failed"
      ? t("platform.sync.jobs.actions.retry.title")
      : t("platform.sync.jobs.actions.resume.title");
  }

  function syncTokenLabel(hasToken: boolean) {
    return hasToken ? t("platform.sync.jobs.request.tokenPresent") : t("platform.sync.jobs.request.tokenMissing");
  }

  function progressLabel(done: number, total: number) {
    return `${done}/${total}`;
  }

  function selectedJobActionState(job: Pick<SyncJob, "id">) {
    return actionJobId() === job.id;
  }

  function jobStageLabel(stage: string) {
    const fetchMedia = stage.match(/^fetch_media:(\d+)\/(\d+)$/);
    if (fetchMedia) {
      return t("platform.sync.jobs.stages.fetchMedia", {
        done: fetchMedia[1],
        total: fetchMedia[2],
      });
    }
    const fetchOci = stage.match(/^fetch_oci:(\d+)\/(\d+)$/);
    if (fetchOci) {
      return t("platform.sync.jobs.stages.fetchOci", {
        done: fetchOci[1],
        total: fetchOci[2],
      });
    }
    switch (stage) {
      case "queued":
        return t("platform.sync.jobs.stages.queued");
      case "discover":
        return t("platform.sync.jobs.stages.discover");
      case "fetch_repo:init":
        return t("platform.sync.jobs.stages.fetchRepoInit");
      case "fetch_repo:fetch":
        return t("platform.sync.jobs.stages.fetchRepoFetch");
      case "fetch_repo:checkout":
        return t("platform.sync.jobs.stages.fetchRepoCheckout");
      case "fetch_repo:verify":
        return t("platform.sync.jobs.stages.fetchRepoVerify");
      case "fetch_repo:done":
        return t("platform.sync.jobs.stages.fetchRepoDone");
      case "finalize:move_repo":
        return t("platform.sync.jobs.stages.finalizeMoveRepo");
      case "completed":
        return t("platform.sync.jobs.stages.completed");
      default:
        return stage;
    }
  }

  function onImportCatalog() {
    if (catalogSourceId() == null || !catalogGameKey() || !catalogReleaseId() || !catalogUpstreamInstanceId()) {
      return;
    }
    importCatalogMutation.mutate({
      source_id: catalogSourceId()!,
      game_key: catalogGameKey()!,
      release_id: catalogReleaseId()!,
      upstream_instance_id: catalogUpstreamInstanceId()!,
    });
  }

  return (
    <>
      <Title page={t("platform.sync.title")} route="/admin/sync" />
      <div class="flex-1 flex flex-col p-3 lg:p-6 space-y-3">
        <Card contentClass="p-4 flex flex-col space-y-3">
          <div class="flex flex-row items-center space-x-2 font-bold">
            <span class="shrink-0 icon-[fluent--database-plug-connected-20-regular] w-5 h-5" />
            <span>{t("platform.sync.sources.title")}</span>
          </div>
          <p class="opacity-80">{t("platform.sync.sources.description")}</p>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <Input
              value={form().name}
              onInput={(event) => updateForm("name", event.currentTarget.value)}
              title={t("platform.sync.sources.form.name")}
              placeholder={t("platform.sync.sources.form.name")}
              icon={<span class="shrink-0 icon-[fluent--tag-20-regular] w-5 h-5" />}
            />
            <Input
              value={form().branch}
              onInput={(event) => updateForm("branch", event.currentTarget.value)}
              title={t("platform.sync.sources.form.branch")}
              placeholder="main"
              icon={<span class="shrink-0 icon-[fluent--branch-fork-20-regular] w-5 h-5" />}
            />
          </div>
          <Input
            value={form().git_url}
            onInput={(event) => updateForm("git_url", event.currentTarget.value)}
            title={t("platform.sync.sources.form.gitUrl")}
            placeholder="https://github.com/ret2shell/game-registry"
            icon={<span class="shrink-0 icon-[fluent--link-20-regular] w-5 h-5" />}
          />
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <Input
              type="number"
              value={form().priority}
              onInput={(event) => updateForm("priority", Number.parseInt(event.currentTarget.value || "0", 10) || 0)}
              title={t("platform.sync.sources.form.priority")}
              placeholder="0"
              icon={<span class="shrink-0 icon-[fluent--arrow-sort-20-regular] w-5 h-5" />}
            />
            <Checkbox checked={form().enabled} onChange={() => updateForm("enabled", !form().enabled)}>
              <span class="flex-1 text-start">{t("platform.sync.sources.form.enabled")}</span>
            </Checkbox>
          </div>
          <div class="flex flex-row justify-end space-x-2">
            <Show when={isEditing()}>
              <Button ghost onClick={resetForm}>
                {t("general.actions.cancel.title")}
              </Button>
            </Show>
            <Button
              level="primary"
              onClick={onSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {isEditing() ? t("general.actions.save.title") : t("general.actions.create.title")}
            </Button>
          </div>
        </Card>

        <Card contentClass="p-4 flex flex-col space-y-3">
          <div class="flex flex-row items-center space-x-2 font-bold">
            <span class="shrink-0 icon-[fluent--book-open-20-regular] w-5 h-5" />
            <span>{t("platform.sync.catalog.title")}</span>
          </div>
          <p class="opacity-80">{t("platform.sync.catalog.description")}</p>
          <Select
            label={t("platform.sync.catalog.source")}
            placeholder={t("platform.sync.catalog.sourcePlaceholder")}
            items={(sources.data || []).map((source) => ({
              label: `${source.name} (${source.branch})`,
              value: source.id.toString(),
            }))}
            value={catalogSourceId() != null ? [catalogSourceId()!.toString()] : []}
            onValueChange={(details) => {
              setCatalogSourceId(Number.parseInt(details.value[0] || "0", 10) || null);
              setCatalogGameKey(null);
              setCatalogReleaseId(null);
              setCatalogUpstreamInstanceId(null);
            }}
            disabled={!sources.data?.length}
          />
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div class="flex flex-col gap-2">
              <div class="font-bold text-sm">{t("platform.sync.catalog.games")}</div>
              <For
                each={catalogGames.data || []}
                fallback={<span class="opacity-70 text-sm">{t("platform.sync.catalog.emptyGames")}</span>}
              >
                {(game) => (
                  <button
                    type="button"
                    class="border border-layer-content/10 rounded-lg p-3 text-start hover:border-primary/40 transition-colors"
                    onClick={() => {
                      setCatalogGameKey(game.game_key);
                      setCatalogReleaseId(null);
                      setCatalogUpstreamInstanceId(null);
                    }}
                  >
                    <div class="font-mono break-all">{game.game_key}</div>
                    <div class="text-sm opacity-70">
                      {t("platform.sync.catalog.releaseCount", { count: game.release_count })}
                    </div>
                  </button>
                )}
              </For>
            </div>
            <div class="flex flex-col gap-2">
              <div class="font-bold text-sm">{t("platform.sync.catalog.releases")}</div>
              <For
                each={catalogReleases.data || []}
                fallback={<span class="opacity-70 text-sm">{t("platform.sync.catalog.emptyReleases")}</span>}
              >
                {(release) => (
                  <button
                    type="button"
                    class="border border-layer-content/10 rounded-lg p-3 text-start hover:border-primary/40 transition-colors"
                    onClick={() => {
                      setCatalogReleaseId(release.release_id);
                      setCatalogUpstreamInstanceId(null);
                    }}
                  >
                    <div class="font-mono break-all">{release.release_id}</div>
                    <div class="text-sm opacity-70 break-all">{release.first_party_base_url}</div>
                  </button>
                )}
              </For>
            </div>
            <div class="flex flex-col gap-2">
              <div class="font-bold text-sm">{t("platform.sync.catalog.upstreams")}</div>
              <For
                each={catalogDetail.data?.upstreams || []}
                fallback={<span class="opacity-70 text-sm">{t("platform.sync.catalog.emptyUpstreams")}</span>}
              >
                {(upstream) => (
                  <button
                    type="button"
                    class="border border-layer-content/10 rounded-lg p-3 text-start hover:border-primary/40 transition-colors"
                    onClick={() => setCatalogUpstreamInstanceId(upstream.instance_id)}
                  >
                    <div class="font-mono break-all">{upstream.instance_id}</div>
                    <div class="text-sm opacity-70">{upstream.role}</div>
                    <div class="text-sm opacity-70 break-all">{upstream.base_url}</div>
                  </button>
                )}
              </For>
            </div>
          </div>
          <Show when={catalogDetail.data?.conflicts?.length}>
            <Card level="warning" contentClass="p-3 flex flex-col gap-2">
              <div class="font-bold">{t("platform.sync.catalog.conflicts.title")}</div>
              <span class="text-sm opacity-80">{t("platform.sync.catalog.conflicts.description")}</span>
              <For each={catalogDetail.data?.conflicts || []}>
                {(conflict) => (
                  <div class="rounded-lg border border-warning/30 bg-warning/5 p-3 flex flex-col gap-1 text-sm">
                    <span class="font-bold">{conflict.source_name}</span>
                    <span class="font-mono break-all">{conflict.snapshot_commit}</span>
                    <span class="font-mono break-all opacity-80">{conflict.manifest_sha256}</span>
                  </div>
                )}
              </For>
            </Card>
          </Show>
          <div class="flex flex-row justify-end">
            <Button
              level="primary"
              onClick={onImportCatalog}
              loading={importCatalogMutation.isPending}
              disabled={
                importCatalogMutation.isPending ||
                catalogSourceId() == null ||
                !catalogGameKey() ||
                !catalogReleaseId() ||
                !catalogUpstreamInstanceId()
              }
            >
              {t("platform.sync.catalog.import.title")}
            </Button>
          </div>
        </Card>

        <Card contentClass="p-4 flex flex-col space-y-3">
          <div class="flex flex-row items-center space-x-2 font-bold">
            <span class="shrink-0 icon-[fluent--globe-arrow-up-20-regular] w-5 h-5" />
            <span>{t("platform.sync.direct.title")}</span>
          </div>
          <p class="opacity-80">{t("platform.sync.direct.description")}</p>
          <Input
            value={discoverBaseUrl()}
            onInput={(event) => setDiscoverBaseUrl(event.currentTarget.value)}
            title={t("platform.sync.direct.form.baseUrl")}
            placeholder="https://ctf.example.com"
            icon={<span class="shrink-0 icon-[fluent--link-20-regular] w-5 h-5" />}
          />
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-2">
            <Input
              value={discoverSyncToken()}
              onInput={(event) => setDiscoverSyncToken(event.currentTarget.value)}
              title={t("platform.sync.direct.form.syncToken")}
              placeholder="r2s_sync_xxxxx"
              icon={<span class="shrink-0 icon-[fluent--key-20-regular] w-5 h-5" />}
            />
            <Input
              value={discoverGameKey()}
              onInput={(event) => setDiscoverGameKey(event.currentTarget.value)}
              title={t("platform.sync.direct.form.gameKey")}
              placeholder="example_game"
              icon={<span class="shrink-0 icon-[fluent--cube-20-regular] w-5 h-5" />}
            />
            <Input
              value={discoverReleaseId()}
              onInput={(event) => setDiscoverReleaseId(event.currentTarget.value)}
              title={t("platform.sync.direct.form.releaseId")}
              placeholder="commit id"
              icon={<span class="shrink-0 icon-[fluent--history-20-regular] w-5 h-5" />}
            />
          </div>
          <div class="flex flex-row justify-end">
            <div class="flex flex-row gap-2">
              <Button
                level="primary"
                onClick={onDiscover}
                loading={discoverMutation.isPending}
                disabled={discoverMutation.isPending}
              >
                {t("platform.sync.direct.action")}
              </Button>
              <Button
                onClick={onImport}
                loading={importMutation.isPending}
                disabled={importMutation.isPending || !discoverGameKey().trim() || !discoverReleaseId().trim()}
              >
                {t("platform.sync.direct.import.title")}
              </Button>
            </div>
          </div>
          <Show when={discoverResult()}>
            {(result) => (
              <div class="flex flex-col space-y-3">
                <div class="text-sm opacity-80">
                  {t("platform.sync.direct.info", {
                    baseUrl: result().info.base_url,
                    version: result().info.protocol_version,
                  })}
                </div>
                <Show when={result().games?.length}>
                  <div class="flex flex-col space-y-2">
                    <div class="font-bold">{t("platform.sync.direct.games")}</div>
                    <For each={result().games || []}>
                      {(game) => (
                        <button
                          type="button"
                          class="border border-layer-content/10 rounded-lg p-3 flex flex-row justify-between gap-2 text-start hover:border-primary/40 transition-colors"
                          onClick={() => {
                            setDiscoverGameKey(game.game_key);
                            setDiscoverReleaseId("");
                          }}
                        >
                          <span class="font-mono break-all">{game.game_key}</span>
                          <span class="opacity-70 text-sm">
                            {t("platform.sync.direct.releaseCount", { count: game.release_count })}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={result().releases?.length}>
                  <div class="flex flex-col space-y-2">
                    <div class="font-bold">{t("platform.sync.direct.releases")}</div>
                    <For each={result().releases || []}>
                      {(release) => (
                        <button
                          type="button"
                          class="border border-layer-content/10 rounded-lg p-3 flex flex-col gap-1 text-start hover:border-primary/40 transition-colors"
                          onClick={() => {
                            setDiscoverGameKey(release.game_key);
                            setDiscoverReleaseId(release.release_id);
                          }}
                        >
                          <span class="font-mono break-all">{release.release_id}</span>
                          <span class="text-sm opacity-70">{release.first_party_base_url}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={result().release}>
                  {(release) => (
                    <div class="border border-layer-content/10 rounded-lg p-3 flex flex-col gap-1">
                      <span class="font-mono break-all">{release().release_id}</span>
                      <span class="text-sm opacity-70">{release().snapshot_commit}</span>
                      <span class="text-sm opacity-70">{release().first_party_base_url}</span>
                    </div>
                  )}
                </Show>
              </div>
            )}
          </Show>
        </Card>

        <Card contentClass="p-4 flex flex-col space-y-3">
          <div class="flex flex-row items-center justify-between gap-2">
            <div class="flex flex-row items-center space-x-2 font-bold">
              <span class="shrink-0 icon-[fluent--history-20-regular] w-5 h-5" />
              <span>{t("platform.sync.jobs.title")}</span>
            </div>
            <Button size="sm" ghost onClick={() => jobs.refetch()}>
              {t("platform.sync.jobs.actions.refresh.title")}
            </Button>
          </div>
          <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-3">
            <div class="flex flex-col gap-2">
              <For each={jobs.data || []} fallback={<span class="opacity-70">{t("platform.sync.jobs.empty")}</span>}>
                {(job) => (
                  <div
                    class={`border rounded-lg p-3 flex flex-col gap-2 transition-colors ${selectedJobId() === job.id ? "border-primary/50 bg-primary/5" : "border-layer-content/10"}`}
                  >
                    <div class="flex flex-row justify-between gap-2 items-start">
                      <div class="flex flex-col min-w-0">
                        <div class="flex flex-row items-center gap-2 flex-wrap">
                          <span class="font-mono">#{job.id}</span>
                          <span class="text-xs uppercase opacity-60">{jobModeLabel(job.mode)}</span>
                        </div>
                        <span class="text-sm opacity-80 break-all">
                          {job.game_key || "-"} / {job.release_id || "-"}
                        </span>
                        <span class="text-sm opacity-70">
                          {t("platform.sync.jobs.stage", {
                            status: jobStatusLabel(job.status),
                            stage: jobStageLabel(job.stage),
                          })}
                        </span>
                      </div>
                      <div class="flex flex-row gap-2">
                        <Button size="sm" ghost onClick={() => setSelectedJobId(job.id)}>
                          {t("general.actions.open.title")}
                        </Button>
                        <Show when={job.can_resume}>
                          <Button
                            size="sm"
                            onClick={() => runResumeJob(job)}
                            loading={resumeJobMutation.isPending && selectedJobActionState(job)}
                            disabled={resumeJobMutation.isPending || cancelJobMutation.isPending}
                          >
                            {jobResumeLabel(job)}
                          </Button>
                        </Show>
                        <Show when={job.can_cancel}>
                          <Button
                            size="sm"
                            level="warning"
                            onClick={() => runCancelJob(job)}
                            loading={cancelJobMutation.isPending && selectedJobActionState(job)}
                            disabled={resumeJobMutation.isPending || cancelJobMutation.isPending}
                          >
                            {t("platform.sync.jobs.actions.cancel.title")}
                          </Button>
                        </Show>
                        <Show when={job.game_id != null && job.status === "completed"}>
                          <Button size="sm" onClick={() => openImportedGame(job)}>
                            {t("platform.sync.jobs.actions.openGame.title")}
                          </Button>
                        </Show>
                      </div>
                    </div>
                    <Show when={job.upstream_base_url}>
                      <span class="text-sm opacity-70 break-all">
                        {t("platform.sync.jobs.upstream", { value: job.upstream_base_url || "-" })}
                      </span>
                    </Show>
                    <Show when={job.error_message}>
                      <span class="text-xs text-error whitespace-pre-wrap break-all line-clamp-2">
                        {job.error_message}
                      </span>
                    </Show>
                    <span class="text-xs opacity-70">
                      {t("platform.sync.jobs.updatedAt", {
                        value: job.updated_at.toFormat("yyyy-MM-dd HH:mm:ss"),
                      })}
                    </span>
                  </div>
                )}
              </For>
            </div>

            <div class="border border-layer-content/10 rounded-lg p-4 flex flex-col gap-3 min-h-64">
              <div class="flex flex-row items-start justify-between gap-3">
                <div class="flex flex-col min-w-0">
                  <span class="font-bold">{t("platform.sync.jobs.detail.title")}</span>
                  <Show when={selectedJob.data}>
                    {(job) => (
                      <span class="text-sm opacity-70">
                        {t("platform.sync.jobs.stage", {
                          status: jobStatusLabel(job().status),
                          stage: jobStageLabel(job().stage),
                        })}
                      </span>
                    )}
                  </Show>
                </div>
                <Show when={selectedJob.data}>
                  {(job) => (
                    <div class="flex flex-row gap-2">
                      <Show when={job().can_resume}>
                        <Button
                          size="sm"
                          onClick={() => runResumeJob(job())}
                          loading={resumeJobMutation.isPending && selectedJobActionState(job())}
                          disabled={resumeJobMutation.isPending || cancelJobMutation.isPending}
                        >
                          {jobResumeLabel(job())}
                        </Button>
                      </Show>
                      <Show when={job().can_cancel}>
                        <Button
                          size="sm"
                          level="warning"
                          onClick={() => runCancelJob(job())}
                          loading={cancelJobMutation.isPending && selectedJobActionState(job())}
                          disabled={resumeJobMutation.isPending || cancelJobMutation.isPending}
                        >
                          {t("platform.sync.jobs.actions.cancel.title")}
                        </Button>
                      </Show>
                      <Show when={job().game_id != null && job().status === "completed"}>
                        <Button size="sm" onClick={() => openImportedGame(job())}>
                          {t("platform.sync.jobs.actions.openGame.title")}
                        </Button>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>

              <Show
                when={selectedJob.data as SyncJobDetail | undefined}
                fallback={
                  <span class="opacity-70">
                    {selectedJobId() == null
                      ? t("platform.sync.jobs.detail.empty")
                      : t("platform.sync.jobs.detail.loading")}
                  </span>
                }
              >
                {(detail) => (
                  <>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div class="rounded-lg border border-layer-content/10 p-3 flex flex-col gap-2">
                        <span class="font-bold text-sm">{t("platform.sync.jobs.detail.summary")}</span>
                        <span class="font-mono">#{detail().id}</span>
                        <span class="text-sm opacity-70">{jobModeLabel(detail().mode)}</span>
                        <span class="text-sm opacity-70 break-all">
                          {detail().game_key || "-"} / {detail().release_id || "-"}
                        </span>
                        <Show when={detail().registry_source_id != null}>
                          <span class="text-sm opacity-70">
                            {t("platform.sync.catalog.source")}: #{detail().registry_source_id}
                          </span>
                        </Show>
                        <Show when={detail().upstream_instance_id}>
                          <span class="text-sm opacity-70 break-all">
                            {t("platform.sync.jobs.detail.upstreamInstance", {
                              value: detail().upstream_instance_id || "-",
                            })}
                          </span>
                        </Show>
                        <Show when={detail().upstream_base_url}>
                          <span class="text-sm opacity-70 break-all">
                            {t("platform.sync.jobs.upstream", { value: detail().upstream_base_url || "-" })}
                          </span>
                        </Show>
                        <span class="text-sm opacity-70">
                          {t("platform.sync.jobs.createdAt", {
                            value: detail().created_at.toFormat("yyyy-MM-dd HH:mm:ss"),
                          })}
                        </span>
                        <span class="text-sm opacity-70">
                          {t("platform.sync.jobs.updatedAt", {
                            value: detail().updated_at.toFormat("yyyy-MM-dd HH:mm:ss"),
                          })}
                        </span>
                        <Show when={detail().finished_at}>
                          <span class="text-sm opacity-70">
                            {t("platform.sync.jobs.finishedAt", {
                              value: detail().finished_at?.toFormat("yyyy-MM-dd HH:mm:ss") || "-",
                            })}
                          </span>
                        </Show>
                      </div>

                      <div class="rounded-lg border border-layer-content/10 p-3 flex flex-col gap-2">
                        <span class="font-bold text-sm">{t("platform.sync.jobs.detail.request")}</span>
                        <span class="text-sm opacity-70 break-all">
                          {t("platform.sync.direct.form.baseUrl")}: {detail().request.base_url}
                        </span>
                        <span class="text-sm opacity-70">
                          {t("platform.sync.direct.form.syncToken")}: {syncTokenLabel(detail().request.has_sync_token)}
                        </span>
                        <span class="text-sm opacity-70 break-all">
                          {t("platform.sync.direct.form.gameKey")}:{" "}
                          <span class="font-mono">{detail().request.game_key}</span>
                        </span>
                        <span class="text-sm opacity-70 break-all">
                          {t("platform.sync.direct.form.releaseId")}:{" "}
                          <span class="font-mono">{detail().request.release_id}</span>
                        </span>
                      </div>
                    </div>

                    <div class="rounded-lg border border-layer-content/10 p-3 flex flex-col gap-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-bold text-sm">{t("platform.sync.jobs.detail.checkpoint")}</span>
                        <Show when={detail().checkpoint.bucket_name}>
                          <span class="text-sm opacity-70 break-all">
                            {t("platform.sync.jobs.detail.bucket", { value: detail().checkpoint.bucket_name || "-" })}
                          </span>
                        </Show>
                      </div>

                      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div class="rounded-lg border border-layer-content/10 p-3 flex flex-col gap-2">
                          <span class="font-bold text-sm">{t("platform.sync.jobs.detail.repo")}</span>
                          <span class="text-sm opacity-80">
                            {detail().checkpoint.repo.initialized ? "✓" : "○"} {jobStageLabel("fetch_repo:init")}
                          </span>
                          <span class="text-sm opacity-80">
                            {detail().checkpoint.repo.fetched_release_ref ? "✓" : "○"}{" "}
                            {jobStageLabel("fetch_repo:fetch")}
                          </span>
                          <span class="text-sm opacity-80">
                            {detail().checkpoint.repo.checked_out_snapshot ? "✓" : "○"}{" "}
                            {jobStageLabel("fetch_repo:checkout")}
                          </span>
                          <span class="text-sm opacity-80">
                            {detail().checkpoint.repo.verified_snapshot ? "✓" : "○"}{" "}
                            {jobStageLabel("fetch_repo:verify")}
                          </span>
                        </div>

                        <div class="rounded-lg border border-layer-content/10 p-3 flex flex-col gap-2">
                          <span class="font-bold text-sm">{t("platform.sync.jobs.detail.media")}</span>
                          <span class="text-2xl font-mono">
                            {progressLabel(detail().checkpoint.media.done, detail().checkpoint.media.total)}
                          </span>
                          <span class="text-sm opacity-80">
                            {detail().checkpoint.media.completed ? "✓" : "○"}{" "}
                            {jobStageLabel(
                              `fetch_media:${detail().checkpoint.media.done}/${detail().checkpoint.media.total}`
                            )}
                          </span>
                        </div>

                        <div class="rounded-lg border border-layer-content/10 p-3 flex flex-col gap-2">
                          <span class="font-bold text-sm">{t("platform.sync.jobs.detail.oci")}</span>
                          <span class="text-2xl font-mono">
                            {progressLabel(detail().checkpoint.oci.done, detail().checkpoint.oci.total)}
                          </span>
                          <span class="text-sm opacity-80">
                            {detail().checkpoint.oci.completed ? "✓" : "○"}{" "}
                            {jobStageLabel(
                              `fetch_oci:${detail().checkpoint.oci.done}/${detail().checkpoint.oci.total}`
                            )}
                          </span>
                        </div>
                      </div>

                      <Show
                        when={detail().checkpoint.discovered}
                        fallback={<span class="text-sm opacity-70">{t("platform.sync.jobs.detail.noDiscovery")}</span>}
                      >
                        {(discovered) => (
                          <div class="rounded-lg border border-layer-content/10 p-3 flex flex-col gap-1">
                            <span class="font-bold text-sm">{t("platform.sync.jobs.detail.discovered")}</span>
                            <span class="text-sm opacity-70 break-all">
                              {t("platform.sync.jobs.detail.remote", { value: discovered().remote_base_url })}
                            </span>
                            <span class="text-sm opacity-70 break-all">
                              {t("platform.sync.jobs.detail.snapshot", { value: discovered().snapshot_commit })}
                            </span>
                            <span class="text-sm opacity-70 break-all">
                              {t("platform.sync.jobs.detail.manifest", { value: discovered().manifest_sha256 })}
                            </span>
                            <span class="text-sm opacity-70 break-all">
                              {t("platform.sync.jobs.detail.firstParty", { value: discovered().first_party_base_url })}
                            </span>
                            <span class="text-sm opacity-70">
                              {t("platform.sync.jobs.detail.publishedAt", {
                                value: discovered().published_at.toFormat("yyyy-MM-dd HH:mm:ss"),
                              })}
                            </span>
                            <span class="text-sm opacity-70">
                              {t("platform.sync.jobs.detail.protocolVersion", { value: discovered().protocol_version })}
                            </span>
                          </div>
                        )}
                      </Show>

                      <Show when={detail().error_message}>
                        <pre class="whitespace-pre-wrap break-all rounded-lg border border-layer-content/10 p-3 text-xs overflow-x-auto text-error">
                          {detail().error_message}
                        </pre>
                      </Show>
                    </div>
                  </>
                )}
              </Show>
            </div>
          </div>
        </Card>

        <For
          each={sources.data || []}
          fallback={
            <Card contentClass="p-4 opacity-70 flex flex-row items-center space-x-2">
              <span class="shrink-0 icon-[fluent--box-20-regular] w-5 h-5" />
              <span>{t("platform.sync.sources.empty")}</span>
            </Card>
          }
        >
          {(source) => (
            <Card contentClass="p-4 flex flex-col space-y-3">
              <div class="flex flex-row items-start gap-2">
                <div class="flex-1 min-w-0 flex flex-col">
                  <div class="font-bold truncate">{source.name}</div>
                  <div class="opacity-70 truncate">{source.git_url}</div>
                </div>
                <div class="flex flex-row gap-2">
                  <Button size="sm" ghost onClick={() => beginEdit(source)}>
                    {t("general.actions.edit.title")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => fetchMutation.mutate({ id: source.id })}
                    loading={fetchMutation.isPending}
                    disabled={fetchMutation.isPending}
                  >
                    {t("platform.sync.sources.actions.fetch.title")}
                  </Button>
                  <Button
                    size="sm"
                    level="error"
                    ghost
                    onClick={() => deleteMutation.mutate({ id: source.id })}
                    loading={deleteMutation.isPending}
                    disabled={deleteMutation.isPending}
                  >
                    {t("general.actions.delete.title")}
                  </Button>
                </div>
              </div>
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 text-sm opacity-80">
                <span>
                  {t("platform.sync.sources.form.branch")}: {source.branch}
                </span>
                <span>
                  {t("platform.sync.sources.form.priority")}: {source.priority}
                </span>
                <span>
                  {t("platform.sync.sources.badges.enabled", {
                    enabled: source.enabled
                      ? t("platform.sync.sources.state.enabled")
                      : t("platform.sync.sources.state.disabled"),
                  })}
                </span>
              </div>
              <Show when={source.last_fetched_at}>
                <span class="text-sm opacity-70">
                  {t("platform.sync.sources.lastFetched", {
                    value: source.last_fetched_at?.toFormat("yyyy-MM-dd HH:mm:ss") || "-",
                  })}
                </span>
              </Show>
              <Show when={source.last_error}>
                <div class="text-sm text-error whitespace-pre-wrap break-all">{source.last_error}</div>
              </Show>
            </Card>
          )}
        </For>
      </div>
    </>
  );
}

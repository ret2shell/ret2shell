import { handleHttpError } from "@api";
import { importFromRegistry, useRegistryIndexMutation } from "@api/sync";
import type { RegistryIndexEntry } from "@models/sync";
import { shortOid } from "@models/sync";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import Tag from "@widgets/tag";
import { createSignal, For, Show } from "solid-js";

const REGISTRY_URL_STORAGE_KEY = "sync-registry-url";

/**
 * Community download panel. The registry index is fetched through the backend
 * (entry tokens never reach the browser); importing an entry re-reads it
 * server-side by bucket id, so the browser only ever handles the index URL —
 * which is a public document and safe to remember locally.
 */
export default function CommunityPanel(props: { onDone?: () => void }) {
  const registryIndex = useRegistryIndexMutation({
    onSuccess: (entries) => setEntries(entries),
  });
  const [indexUrl, setIndexUrl] = createSignal(localStorage.getItem(REGISTRY_URL_STORAGE_KEY) ?? "");
  const [entries, setEntries] = createSignal<RegistryIndexEntry[]>([]);
  const [search, setSearch] = createSignal("");
  const [importLog, setImportLog] = createSignal("");
  const [importingBucket, setImportingBucket] = createSignal<string | null>(null);
  const [importFailed, setImportFailed] = createSignal<string | null>(null);

  function fetchIndex() {
    const url = indexUrl().trim();
    if (!url) {
      return;
    }
    localStorage.setItem(REGISTRY_URL_STORAGE_KEY, url);
    setImportFailed(null);
    registryIndex.mutate(url);
  }

  const filtered = () => {
    const query = search().trim().toLowerCase();
    if (!query) {
      return entries();
    }
    return entries().filter(
      (entry) => entry.name.toLowerCase().includes(query) || entry.bucket_id.toLowerCase().includes(query)
    );
  };

  async function importEntry(entry: RegistryIndexEntry) {
    setImportFailed(null);
    setImportLog("");
    setImportingBucket(entry.bucket_id);
    let gameId: number | undefined;
    try {
      const progress = await importFromRegistry(
        { registry_url: indexUrl().trim(), bucket_id: entry.bucket_id },
        (chunk) => setImportLog((previous) => previous + chunk)
      );
      gameId = progress.gameId;
    } catch (err) {
      handleHttpError(err as Error, t("platform.sync.actions.import.status.fail"));
      setImportingBucket(null);
      return;
    }
    setImportingBucket(null);
    if (gameId === undefined) {
      setImportFailed(t("platform.sync.actions.import.status.noGameId"));
      return;
    }
    props.onDone?.();
  }

  const busy = () => importingBucket() !== null || registryIndex.isPending;

  return (
    <div class="flex flex-col w-screen max-w-2xl space-y-2">
      <div class="flex flex-col lg:flex-row lg:items-end lg:space-x-2">
        <div class="flex-1">
          <Input
            icon={<span class="shrink-0 icon-[fluent--cloud-arrow-down-20-regular] w-5 h-5" />}
            type="url"
            title={t("platform.sync.community.indexUrl.label")}
            placeholder={t("platform.sync.community.indexUrl.placeholder")}
            autocomplete="off"
            value={indexUrl()}
            error={null}
            onInput={(event) => setIndexUrl(event.currentTarget.value)}
          />
        </div>
        <Button
          type="button"
          level="primary"
          loading={registryIndex.isPending}
          disabled={busy() || indexUrl().trim() === ""}
          onClick={() => fetchIndex()}
        >
          <span class="shrink-0 icon-[fluent--cloud-sync-20-regular] w-5 h-5" />
          <span>{t("platform.sync.community.fetch.title")}</span>
        </Button>
      </div>
      <p class="text-sm opacity-60">{t("platform.sync.community.indexUrl.hint")}</p>
      <Show when={entries().length > 0}>
        <Input
          icon={<span class="shrink-0 icon-[fluent--search-20-regular] w-5 h-5" />}
          type="text"
          title={t("platform.sync.community.search")}
          placeholder={t("platform.sync.community.search")}
          autocomplete="off"
          value={search()}
          error={null}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
      </Show>
      <Show when={registryIndex.isSuccess}>
        <Show
          when={filtered().length > 0}
          fallback={
            <div class="flex flex-col items-center space-y-2 p-6 opacity-60">
              <span class="shrink-0 icon-[fluent--cloud-off-20-regular] w-8 h-8" />
              <span>{t("platform.sync.community.empty")}</span>
            </div>
          }
        >
          <div class="max-h-80 overflow-y-auto flex flex-col space-y-2 pr-1">
            <For each={filtered()}>
              {(entry) => (
                <Card>
                  <Card contentClass="p-2 lg:p-3 flex flex-col space-y-2">
                    <div class="flex items-center space-x-2 min-w-0">
                      <span class="font-bold truncate" title={entry.name}>
                        {entry.name}
                      </span>
                      <Show when={!entry.has_token}>
                        <Tag level="warning">{t("platform.sync.community.noToken")}</Tag>
                      </Show>
                      <span class="flex-1" />
                      <Button
                        size="sm"
                        level="primary"
                        type="button"
                        loading={importingBucket() === entry.bucket_id}
                        disabled={busy() || !entry.has_token}
                        onClick={() => importEntry(entry)}
                      >
                        <span class="shrink-0 icon-[fluent--cloud-arrow-down-20-regular] w-5 h-5" />
                        <span>{t("platform.sync.community.actions.import")}</span>
                      </Button>
                    </div>
                    <Show when={entry.description}>
                      <p class="text-sm opacity-70 text-start">{entry.description}</p>
                    </Show>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span class="opacity-70">{t("platform.sync.community.list.bucketId")}</span>
                      <span class="truncate font-mono" title={entry.bucket_id}>
                        {entry.bucket_id}
                      </span>
                      <span class="opacity-70">{t("platform.sync.community.list.endpoint")}</span>
                      <span class="truncate" title={entry.endpoint}>
                        {entry.endpoint}
                      </span>
                      <span class="opacity-70">{t("platform.sync.community.list.headRef")}</span>
                      <span class="font-mono" title={entry.head_ref}>
                        {shortOid(entry.head_ref)}
                      </span>
                      <span class="opacity-70">{t("platform.sync.community.list.mirrors")}</span>
                      <span title={t("platform.sync.community.list.mirrors")}>×{entry.mirror_count}</span>
                    </div>
                  </Card>
                </Card>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={importLog() !== ""}>
        <div class="card">
          <div class="card-content p-2">
            <h4 class="font-bold text-sm space-x-2 flex items-center">
              <span class="shrink-0 icon-[fluent--window-console-20-regular] w-5 h-5" />
              <span>{t("platform.sync.form.importLog.title")}</span>
            </h4>
            <pre class="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto m-0 mt-2">{importLog()}</pre>
          </div>
        </div>
      </Show>
      <Show when={importFailed()}>
        <div class="text-error text-sm flex items-center space-x-2">
          <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
          <span>{importFailed()}</span>
        </div>
      </Show>
      <p class="text-sm text-warning flex items-start space-x-2">
        <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
        <span>{t("platform.sync.warnings.import")}</span>
      </p>
    </div>
  );
}

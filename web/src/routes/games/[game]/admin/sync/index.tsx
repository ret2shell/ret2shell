import { useGame, useGameSyncStatus } from "@api/game";
import {
  useAdvertiseGameSyncMutation,
  useDetachGameSyncMutation,
  useGameSyncReleases,
  usePublishGameSyncMutation,
  useRotateGameSyncTokenMutation,
} from "@api/sync";
import GameSyncReadonlyBanner from "@lib/blocks/game/sync-readonly-banner";
import { HostType } from "@models/game";
import type { RegistryPublicationMetadata, RegistryUpstreamMetadata } from "@models/sync";
import { useParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import { createMemo, createSignal, For, Show } from "solid-js";

export default function () {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });
  const syncStatus = useGameSyncStatus({ game_id: gameId, enabled: () => gameId() > 0 });
  const releases = useGameSyncReleases({ game_id: gameId, enabled: () => gameId() > 0 });
  const [publicationMetadata, setPublicationMetadata] = createSignal<RegistryPublicationMetadata | null>(null);
  const [upstreamMetadata, setUpstreamMetadata] = createSignal<RegistryUpstreamMetadata | null>(null);
  const [detachConfirmOpen, setDetachConfirmOpen] = createSignal(false);
  const [detachReason, setDetachReason] = createSignal("");

  const publishMutation = usePublishGameSyncMutation({
    onSuccess: (metadata) => {
      setPublicationMetadata(metadata);
      releases.refetch();
      syncStatus.refetch();
    },
  });
  const rotateTokenMutation = useRotateGameSyncTokenMutation({
    onSuccess: () => {
      syncStatus.refetch();
      game.refetch();
    },
  });
  const detachMutation = useDetachGameSyncMutation({
    onSuccess: () => {
      setDetachConfirmOpen(false);
      setDetachReason("");
      syncStatus.refetch();
    },
  });
  const advertiseMutation = useAdvertiseGameSyncMutation({
    onSuccess: (metadata) => {
      setUpstreamMetadata(metadata);
      syncStatus.refetch();
    },
  });

  const canPublish = createMemo(
    () => !!game.data && game.data.host_type === HostType.Game && !syncStatus.data?.readonly
  );
  const currentMirrorRelease = createMemo(() =>
    (releases.data || []).find((release) => release.release_id === syncStatus.data?.remote_release_id)
  );

  return (
    <>
      <Title page={t("game.sync.title")} route={`/games/${gameId()}/admin/sync`} />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center space-y-3">
        <div class="w-full max-w-5xl space-y-3">
          <GameSyncReadonlyBanner gameId={gameId()} />

          <Card contentClass="p-4 flex flex-col space-y-3">
            <div class="flex flex-row items-center space-x-2 font-bold">
              <span class="shrink-0 icon-[fluent--key-20-regular] w-5 h-5" />
              <span>{t("game.sync.identity.title")}</span>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm">
              <div>
                <span class="opacity-70">{t("game.sync.identity.syncKey")}: </span>
                <span class="font-mono break-all">{syncStatus.data?.sync_key || "-"}</span>
              </div>
              <div>
                <span class="opacity-70">{t("game.sync.identity.syncToken")}: </span>
                <span class="font-mono break-all">{syncStatus.data?.sync_token || "-"}</span>
              </div>
            </div>
            <div class="flex flex-row justify-end">
              <Button
                onClick={() => rotateTokenMutation.mutate({ game_id: gameId() })}
                loading={rotateTokenMutation.isPending}
                disabled={rotateTokenMutation.isPending || syncStatus.data?.readonly}
              >
                {t("game.sync.actions.rotateToken.title")}
              </Button>
            </div>
          </Card>

          <Show when={syncStatus.data?.remote_state}>
            <Card contentClass="p-4 flex flex-col space-y-3">
              <div class="flex flex-row items-center space-x-2 font-bold">
                <span class="shrink-0 icon-[fluent--shield-lock-20-regular] w-5 h-5" />
                <span>{t("game.sync.remote.title")}</span>
              </div>
              <div class="flex flex-col gap-1 text-sm">
                <span>
                  {t("game.sync.remote.state", {
                    state:
                      syncStatus.data?.remote_state === "mirror_locked"
                        ? t("game.sync.remote.stateMirrorLocked")
                        : t("game.sync.remote.stateDetached"),
                  })}
                </span>
                <Show when={syncStatus.data?.remote_release_id}>
                  <span>
                    {t("game.sync.remote.release", {
                      value: syncStatus.data?.remote_release_id || "-",
                    })}
                  </span>
                </Show>
                <Show when={syncStatus.data?.remote_first_party_base_url}>
                  <span>
                    {t("game.sync.remote.source", {
                      value: syncStatus.data?.remote_first_party_base_url || "-",
                    })}
                  </span>
                </Show>
                <Show when={currentMirrorRelease()}>
                  {(release) => (
                    <span>
                      {t("game.sync.remote.releaseSummary", {
                        origin:
                          release().origin_role === "first_party"
                            ? t("game.sync.releases.originFirstParty")
                            : t("game.sync.releases.originMirror"),
                        publishedAt: release().published_at.toFormat("yyyy-MM-dd HH:mm:ss"),
                      })}
                    </span>
                  )}
                </Show>
              </div>
              <Show when={syncStatus.data?.remote_state === "mirror_locked"}>
                <p class="opacity-80 text-sm">{t("game.sync.remote.detachDescription")}</p>
                <Show
                  when={detachConfirmOpen()}
                  fallback={
                    <div class="flex flex-row justify-end">
                      <Button level="warning" onClick={() => setDetachConfirmOpen(true)}>
                        {t("game.sync.actions.detach.title")}
                      </Button>
                    </div>
                  }
                >
                  <div class="rounded-lg border border-warning/30 bg-warning/5 p-3 flex flex-col gap-3">
                    <Input
                      value={detachReason()}
                      onInput={(event) => setDetachReason(event.currentTarget.value)}
                      title={t("game.sync.remote.detachReason")}
                      placeholder={t("game.sync.remote.detachReasonPlaceholder")}
                      icon={<span class="shrink-0 icon-[fluent--note-edit-20-regular] w-5 h-5" />}
                    />
                    <span class="text-sm opacity-70">{t("game.sync.remote.detachReasonHelp")}</span>
                    <div class="flex flex-row justify-end gap-2">
                      <Button ghost onClick={() => setDetachConfirmOpen(false)}>
                        {t("general.actions.cancel.title")}
                      </Button>
                      <Button
                        level="warning"
                        onClick={() =>
                          detachMutation.mutate({ game_id: gameId(), reason: detachReason().trim() || undefined })
                        }
                        loading={detachMutation.isPending}
                        disabled={detachMutation.isPending}
                      >
                        {t("game.sync.actions.detach.confirm")}
                      </Button>
                    </div>
                  </div>
                </Show>
              </Show>
            </Card>
          </Show>

          <Show when={syncStatus.data?.remote_state === "mirror_locked"}>
            <Card contentClass="p-4 flex flex-col space-y-3">
              <div class="flex flex-row items-center space-x-2 font-bold">
                <span class="shrink-0 icon-[fluent--share-screen-person-20-regular] w-5 h-5" />
                <span>{t("game.sync.advertise.title")}</span>
              </div>
              <p class="opacity-80 text-sm">{t("game.sync.advertise.description")}</p>
              <div class="flex flex-row justify-end">
                <Button
                  level="primary"
                  onClick={() => advertiseMutation.mutate({ game_id: gameId() })}
                  loading={advertiseMutation.isPending}
                  disabled={advertiseMutation.isPending}
                >
                  {t("game.sync.actions.advertise.title")}
                </Button>
              </div>
            </Card>
          </Show>

          <Card contentClass="p-4 flex flex-col space-y-3">
            <div class="flex flex-row items-center space-x-2 font-bold">
              <span class="shrink-0 icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5" />
              <span>{t("game.sync.publish.title")}</span>
            </div>
            <p class="opacity-80 text-sm">{t("game.sync.publish.description")}</p>
            <div class="flex flex-row justify-end">
              <Button
                level="primary"
                onClick={() => publishMutation.mutate({ game_id: gameId() })}
                loading={publishMutation.isPending}
                disabled={!canPublish() || publishMutation.isPending}
              >
                {t("game.sync.actions.publish.title")}
              </Button>
            </div>
          </Card>

          <Show when={publicationMetadata()}>
            {(metadata) => (
              <Card contentClass="p-4 flex flex-col space-y-3">
                <div class="flex flex-row items-center space-x-2 font-bold">
                  <span class="shrink-0 icon-[fluent--document-text-20-regular] w-5 h-5" />
                  <span>{t("game.sync.manualPr.title")}</span>
                </div>
                <p class="opacity-80 text-sm">{t("game.sync.manualPr.description")}</p>
                <div class="flex flex-col gap-2">
                  <span class="font-bold text-sm">{metadata().release_file_path}</span>
                  <pre class="whitespace-pre-wrap break-all rounded-lg border border-layer-content/10 p-3 text-xs overflow-x-auto">
                    {metadata().release_file_content}
                  </pre>
                </div>
                <div class="flex flex-col gap-2">
                  <span class="font-bold text-sm">{metadata().upstream_file_path}</span>
                  <pre class="whitespace-pre-wrap break-all rounded-lg border border-layer-content/10 p-3 text-xs overflow-x-auto">
                    {metadata().upstream_file_content}
                  </pre>
                </div>
              </Card>
            )}
          </Show>

          <Show when={upstreamMetadata()}>
            {(metadata) => (
              <Card contentClass="p-4 flex flex-col space-y-3">
                <div class="flex flex-row items-center space-x-2 font-bold">
                  <span class="shrink-0 icon-[fluent--document-text-20-regular] w-5 h-5" />
                  <span>{t("game.sync.manualUpstream.title")}</span>
                </div>
                <p class="opacity-80 text-sm">{t("game.sync.manualUpstream.description")}</p>
                <div class="flex flex-col gap-2">
                  <span class="font-bold text-sm">{metadata().upstream_file_path}</span>
                  <pre class="whitespace-pre-wrap break-all rounded-lg border border-layer-content/10 p-3 text-xs overflow-x-auto">
                    {metadata().upstream_file_content}
                  </pre>
                </div>
              </Card>
            )}
          </Show>

          <Card contentClass="p-4 flex flex-col space-y-3">
            <div class="flex flex-row items-center space-x-2 font-bold">
              <span class="shrink-0 icon-[fluent--history-20-regular] w-5 h-5" />
              <span>{t("game.sync.releases.title")}</span>
            </div>
            <For each={releases.data || []} fallback={<span class="opacity-70">{t("game.sync.releases.empty")}</span>}>
              {(release) => (
                <div
                  class="border border-layer-content/10 rounded-lg p-3 flex flex-col space-y-1"
                  classList={{
                    "border-primary/40 bg-primary/5": release.release_id === syncStatus.data?.remote_release_id,
                  }}
                >
                  <div class="flex flex-row items-start justify-between gap-2">
                    <div class="font-mono break-all">{release.release_id}</div>
                    <Show when={release.release_id === syncStatus.data?.remote_release_id}>
                      <span class="text-xs rounded-full border border-primary/30 bg-primary/10 px-2 py-1 shrink-0">
                        {t("game.sync.releases.current")}
                      </span>
                    </Show>
                  </div>
                  <div class="text-sm opacity-80">
                    {t("game.sync.releases.snapshot", { value: release.snapshot_commit })}
                  </div>
                  <div class="text-sm opacity-80">
                    {t("game.sync.releases.origin", {
                      value:
                        release.origin_role === "first_party"
                          ? t("game.sync.releases.originFirstParty")
                          : t("game.sync.releases.originMirror"),
                    })}
                  </div>
                  <div class="text-sm opacity-80 break-all">
                    {t("game.sync.releases.firstPartySource", { value: release.first_party_base_url })}
                  </div>
                  <div class="text-sm opacity-80 break-all">
                    {t("game.sync.releases.firstPartyInstance", { value: release.first_party_instance_id })}
                  </div>
                  <div class="text-sm opacity-80">
                    {t("game.sync.releases.publishedAt", {
                      value: release.published_at.toFormat("yyyy-MM-dd HH:mm:ss"),
                    })}
                  </div>
                </div>
              )}
            </For>
          </Card>

          <Show when={game.data?.host_type !== HostType.Game}>
            <Card level="warning" contentClass="p-4">
              <span>{t("game.sync.trainingHint")}</span>
            </Card>
          </Show>
        </div>
      </div>
    </>
  );
}

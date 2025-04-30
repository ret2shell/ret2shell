import { api_root, handleHttpError } from "@api";
import { deleteChallengeAttachment, getChallengeAttachments } from "@api/game";
import DownloadButton from "@blocks/download-button";
import UploadButton from "@blocks/upload-button";
import type { Challenge } from "@models/challenge";
import { challengeStore, refreshChallengeAssets, setChallengeStore } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import LoadingTips from "@widgets/loading-tips";
import { For, Show, createEffect, createSignal, untrack } from "solid-js";

type FileType = "static" | "mapped" | "checker";

export default function (_props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
}) {
  const [folder, setFolder] = createSignal<FileType>("static");
  const [loading, setLoading] = createSignal(false);
  async function fetchAttachments() {
    setLoading(true);
    try {
      const attachments = await getChallengeAttachments(
        challengeStore.current!.game_id,
        challengeStore.current!.id,
        true,
        folder()
      );
      setChallengeStore({ adminFiles: attachments });
      refreshChallengeAssets();
    } catch (err) {
      handleHttpError(err as Error, t("challenge.file.errors.fetchFiles.title")!);
    }
    setLoading(false);
  }
  createEffect(() => {
    if (challengeStore.current && folder()) {
      untrack(fetchAttachments);
    }
  });

  async function handleDelete(file: string, folder: FileType) {
    try {
      await deleteChallengeAttachment(challengeStore.current!.game_id, challengeStore.current!.id, folder, file);
      await fetchAttachments();
    } catch (err) {
      handleHttpError(err as Error, t("challenge.file.errors.deleteFiles.title")!);
    }
  }
  function folderTips() {
    switch (folder()) {
      case "static":
        return t("challenge.file.type.static.tip");
      case "mapped":
        return t("challenge.file.type.mapped.tip");
      case "checker":
        return t("challenge.file.type.checker.tip");
    }
  }
  return (
    <div class="flex flex-row min-h-full">
      <ul class="w-1/5 min-w-48 flex flex-col shrink-0 space-y-2 p-3 lg:p-6 sticky top-0 self-start">
        <li class="w-full">
          <Button
            ghost={folder() !== "static"}
            class="h-auto w-full"
            onClick={() => setFolder("static")}
            title="$BUCKET/static"
          >
            <div class="flex flex-col py-2 items-start w-full">
              <span>{t("challenge.file.type.static.title")}</span>
              <span class="font-normal opacity-60 w-full text-start truncate">$BUCKET/static</span>
            </div>
          </Button>
        </li>
        <li class="w-full">
          <Button
            ghost={folder() !== "mapped"}
            class="h-auto w-full"
            onClick={() => setFolder("mapped")}
            title="$BUCKET/mapped"
          >
            <div class="flex flex-col py-2 items-start w-full">
              <span>{t("challenge.file.type.mapped.title")}</span>
              <span class="font-normal opacity-60 w-full text-start truncate">$BUCKET/mapped</span>
            </div>
          </Button>
        </li>
        <li class="w-full">
          <Button
            ghost={folder() !== "checker"}
            class="h-auto w-full"
            onClick={() => setFolder("checker")}
            title="$BUCKET/checker"
          >
            <div class="flex flex-col py-2 items-start w-full">
              <span>{t("challenge.file.type.checker.title")}</span>
              <span class="font-normal opacity-60 w-full text-start truncate">$BUCKET/checker</span>
            </div>
          </Button>
        </li>
      </ul>
      <Divider direction="vertical" />
      <div class="flex-1 flex flex-col w-0 space-y-2 p-3 lg:p-6">
        <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 font-bold">
          <span class="icon-[fluent--folder-zip-20-regular] w-5 h-5 shrink-0" />
          <span class="flex-1 text-start">{t("general.actions.upload.title")}</span>
          <UploadButton
            size="sm"
            url={`${api_root}/game/${gameStore.current?.id}/challenge/${challengeStore.current?.id}/file?folder=${folder()}`}
            onDone={fetchAttachments}
            multiple
          />
        </header>
        <Card level="info" contentClass="p-2 flex flex-row space-x-2 items-center">
          <span class="icon-[fluent--info-20-regular] w-5 h-5" />
          <span>{folderTips()}</span>
        </Card>
        <Show when={loading()}>
          <div class="min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2 overflow-hidden">
            <LoadingTips />
          </div>
        </Show>
        <div class="flex flex-col">
          <For each={challengeStore.adminFiles}>
            {(file) => (
              <div class="min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2 overflow-hidden">
                <span class="icon-[fluent--folder-zip-20-regular] w-5 h-5 text-primary shrink-0" />
                <span class="font-bold flex-1 text-start truncate">{file.file}</span>
                <DownloadButton
                  class="m-1 shrink-0"
                  size="sm"
                  file={file.file}
                  icon="icon-[fluent--arrow-download-20-regular]"
                  square
                  url={`${api_root}/game/${challengeStore.current!.game_id}/challenge/${challengeStore.current!.id}/file`}
                  searchParams={{ file: file.file, folder: file.folder }}
                />
                <Button size="sm" square onClick={() => handleDelete(file.file, file.folder)}>
                  <span class="icon-[fluent--delete-16-regular] w-4 h-4" />
                </Button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

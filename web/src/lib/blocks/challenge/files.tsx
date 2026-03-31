import { api_root, inflyClient } from "@api";
import { useChallengeAttachments, useDeleteChallengeAttachmentMutation } from "@api/challenge";
import { useGameSyncStatus } from "@api/game";
import DownloadButton from "@blocks/download-button";
import UploadButton from "@blocks/upload-button";
import GameSyncReadonlyBanner from "@lib/blocks/game/sync-readonly-banner";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import LoadingTips from "@widgets/loading-tips";
import { createSignal, For, Suspense } from "solid-js";
import type { ChallengeWidgetProps } from ".";

type FileType = "static" | "mapped" | "checker";

export default function (props: ChallengeWidgetProps) {
  const [folder, setFolder] = createSignal<FileType>("static");
  const syncStatus = useGameSyncStatus({
    game_id: () => props.gameId,
    enabled: () => props.gameId > 0,
  });

  const attachmentsQuery = useChallengeAttachments({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
    all: () => true,
    folder,
  });

  const deleteAttachmentMutation = useDeleteChallengeAttachmentMutation({
    onSuccess: () => {
      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", props.challengeId],
      });
    },
  });

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
        <GameSyncReadonlyBanner gameId={props.gameId} />
        <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 font-bold">
          <span class="shrink-0 icon-[fluent--folder-zip-20-regular] w-5 h-5" />
          <span class="flex-1 text-start">{t("general.actions.upload.title")}</span>
          <UploadButton
            size="sm"
            url={`${api_root}/game/${props.gameId}/challenge/${props.challengeId}/file?folder=${folder()}`}
            onDone={() => {
              inflyClient.invalidateQueries({
                queryKey: ["game", props.gameId, "challenge", props.challengeId],
              });
            }}
            multiple
            disabled={syncStatus.data?.readonly}
          />
        </header>
        <Card level="info" contentClass="p-2 flex flex-row space-x-2 items-center">
          <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />
          <span>{folderTips()}</span>
        </Card>
        <Suspense
          fallback={
            <div class="min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2 overflow-hidden">
              <LoadingTips />
            </div>
          }
        >
          <div class="flex flex-col">
            <For each={attachmentsQuery.data}>
              {(file) => (
                <div class="min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2 overflow-hidden">
                  <span class="shrink-0 icon-[fluent--folder-zip-20-regular] w-5 h-5 text-primary" />
                  <span class="font-bold flex-1 text-start truncate">{file.file}</span>
                  <DownloadButton
                    class="m-1 shrink-0"
                    size="sm"
                    file={file.file}
                    icon="icon-[fluent--arrow-download-20-regular]"
                    square
                    url={`${api_root}/game/${props.gameId}/challenge/${props.challengeId}/file`}
                    searchParams={{ file: file.file, folder: file.folder }}
                  />
                  <Button
                    size="sm"
                    square
                    onClick={() => {
                      if (syncStatus.data?.readonly) {
                        return;
                      }
                      deleteAttachmentMutation.mutate({
                        game_id: props.gameId,
                        challenge_id: props.challengeId,
                        file: file.file,
                        folder: file.folder,
                      });
                    }}
                    loading={deleteAttachmentMutation.isPending}
                    disabled={deleteAttachmentMutation.isPending || syncStatus.data?.readonly}
                  >
                    <span class="shrink-0 icon-[fluent--delete-16-regular] w-4 h-4" />
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Suspense>
      </div>
    </div>
  );
}

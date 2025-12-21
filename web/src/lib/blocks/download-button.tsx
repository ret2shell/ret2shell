import { handleHttpError } from "@api";
import { t } from "@storage/theme";
import type { ButtonProps } from "@widgets/button";
import Button from "@widgets/button";
import clsx from "clsx";
import type { Progress as DownloadProgress } from "ky";
import { createSignal, Match, Show, Switch, splitProps } from "solid-js";
import { downloadFile } from "../api/file";
import { humanFileSize } from "../utils/size";
import Progress from "../widgets/progress";

export default function DownloadButton(
  props: ButtonProps & {
    icon: string;
    file: string;
    url: string;
    withFileName?: boolean;
    displayName?: string;
    searchParams?: { [key: string]: string };
  }
) {
  const [downloadProps, btnProps] = splitProps(props, [
    "icon",
    "file",
    "url",
    "searchParams",
    "withFileName",
    "displayName",
  ]);
  const [downloading, setDownloading] = createSignal(false);
  const [downloadComplete, setDownloadComplete] = createSignal(false);
  const [progress, setProgress] = createSignal(null as DownloadProgress | null);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await downloadFile(downloadProps.url, downloadProps.searchParams, (progress) => {
        setProgress(progress);
      });
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadProps.file;
      a.type = blob.type;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail"));
    }
    setDownloading(false);
    setDownloadComplete(true);
    setTimeout(() => {
      setDownloadComplete(false);
      setProgress(null);
    }, 2000);
  }

  return (
    <Button
      {...btnProps}
      square={btnProps.square && !downloading() && !downloadComplete()}
      class={clsx("relative", btnProps.class)}
      loading={downloading()}
      onClick={handleDownload}
      disabled={downloading()}
    >
      <Switch fallback={<span class={downloadProps.icon} />}>
        <Match when={downloading()}>{null}</Match>
        <Match when={downloadComplete()}>
          <span
            class={
              btnProps.size === "sm"
                ? "icon-[fluent--checkmark-16-regular] w-4 h-4 text-success"
                : "icon-[fluent--checkmark-20-regular] w-5 h-5 text-success"
            }
          />
        </Match>
      </Switch>
      <Show when={downloadProps.withFileName}>
        <span>{downloadProps.displayName ?? downloadProps.file}</span>
      </Show>
      <Show when={downloading()}>
        <span class="mx-2 text-primary">
          {humanFileSize(progress()?.transferredBytes ?? 0, true)}/{humanFileSize(progress()?.totalBytes ?? 0, true)}
        </span>
        <Progress
          class="absolute left-1 right-1 bottom-0"
          min={0}
          max={progress()?.totalBytes ?? 1}
          value={progress()?.transferredBytes ?? 0}
          static
        />
      </Show>
      <Show when={downloadComplete()}>
        <span class="text-success font-bold">DONE</span>
      </Show>
    </Button>
  );
}

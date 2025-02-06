import { handleHttpError } from "@api";
import { type EventDeviceInfo, getGameDevices } from "@api/game";
import NarrowTips from "@blocks/narrow-tips";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Card from "@widgets/card";
import Clipboard from "@widgets/clipboard";
import { For, createEffect, createSignal, untrack } from "solid-js";

export default function () {
  const [linkedDevices, setLinkedDevices] = createSignal([] as EventDeviceInfo[]);
  createEffect(() => {
    if (gameStore.current) {
      untrack(async () => {
        try {
          const devices = await getGameDevices(gameStore.current!.id);
          setLinkedDevices(devices);
        } catch (err) {
          handleHttpError(err as Error, t("game.admin.events.fetchDevicesFailed")!);
        }
      });
    }
  });
  return (
    <>
      <Title page={t("game.admin.events.title")} route={`/games/${gameStore.current?.id}/admin/events`} />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6 relative">
        <div class="flex-1 flex flex-col w-full max-w-5xl">
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <span>{t("game.admin.events.title")} API</span>
          </h2>
          <Card level="info" class="mt-2" contentClass="py-2 px-4">
            <p class="opacity-60 inline">
              <span>{t("game.admin.events.tips1")}</span>
              <span>&nbsp;</span>
              <a
                href="/docs/events"
                class="inline-flex flex-row space-x-2 items-center hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                <span>{t("docs.title")}</span>
                <span class="icon-[fluent--open-16-regular] w-4 h-4 text-primary" />
              </a>
              <span>.&nbsp;</span>
              <span>{t("game.admin.events.tips2")}</span>
            </p>
          </Card>
          <Clipboard
            class="w-full mt-2"
            value={`${window.origin.replace("http", "ws")}/api/event/connect?game_id=${gameStore.current?.id}&token=${gameStore.current?.token || undefined}`}
          />
          <div class="h-4" />
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--developer-board-lightning-20-regular] w-5 h-5" />
            <span>{t("game.admin.events.linkedDevices")}</span>
          </h2>
          <For
            each={linkedDevices()}
            fallback={
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <span class="icon-[fluent--desktop-20-regular] w-24 h-24" />
                <span>{t("game.admin.events.noDevicesLinked")}</span>
              </div>
            }
          >
            {(device) => (
              <>
                <div class="h-12 border-b border-b-layer-content/10 flex flex-row items-center space-x-4 px-2">
                  <span class="w-2 h-2 mx-2 rounded-full bg-success" />
                  <span class="font-bold">{device.address}</span>
                  <span class="flex-1 opacity-60 truncate" title={device.client}>
                    {device.client}
                  </span>
                  <span class="shrink-0">{device.connected_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                </div>
              </>
            )}
          </For>
        </div>
        <NarrowTips breakpoint="lg" />
      </div>
    </>
  );
}

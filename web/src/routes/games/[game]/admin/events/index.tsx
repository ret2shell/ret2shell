import { handleHttpError } from "@api";
import { type EventDeviceInfo, getGameDevices, regenerateGameToken } from "@api/game";
import { createBreakpoints } from "@solid-primitives/media";
import { gameStore, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Clipboard from "@widgets/clipboard";
import Popover from "@widgets/popover";
import { For, Match, Switch, createEffect, createSignal, untrack } from "solid-js";

export default function () {
  const [linkedDevices, setLinkedDevices] = createSignal([] as EventDeviceInfo[]);
  createEffect(() => {
    if (gameStore.current) {
      untrack(async () => {
        try {
          const devices = await getGameDevices(gameStore.current!.id);
          setLinkedDevices(devices);
        } catch (err) {
          handleHttpError(err as Error, t("game.events.errors.fetchDevices.title")!);
        }
      });
    }
  });

  async function handleRefreshToken() {
    try {
      const resp = await regenerateGameToken(gameStore.current!.id);
      setGameStore({ current: { ...gameStore.current!, token: resp.token } });
    } catch (err) {
      handleHttpError(err as Error, t("game.errors.regenerateToken.title")!);
    }
  }

  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <Title page={t("game.events.title")} route={`/games/${gameStore.current?.id}/admin/events`} />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6 relative">
        <div class="flex-1 flex flex-col w-full max-w-5xl">
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <span>{t("game.events.title")} API</span>
          </h2>
          <Card level="info" class="mt-2" contentClass="py-2 px-4">
            <p class="opacity-60 inline">
              <span>{t("game.events.howto")}</span>
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
              <span>{t("game.events.tokenWarning")}</span>
            </p>
          </Card>
          <div class="flex flex-row space-x-2 mt-2">
            <Clipboard
              class="flex-1"
              value={`${window.origin.replace("http", "ws")}/api/event/connect?game_id=${gameStore.current?.id}&token=${gameStore.current?.token || undefined}`}
            />
            <Popover square btnContent={<span class="icon-[fluent--arrow-sync-20-regular] text-error w-5 h-5" />}>
              <Card contentClass="p-2 flex flex-col space-y-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                  <span>{t("game.events.regenerateTokenWarning")}</span>
                </span>
                <Button level="primary" size="sm" class="self-end" onClick={handleRefreshToken}>
                  {t("general.actions.yes.title")}
                </Button>
              </Card>
            </Popover>
          </div>
          <div class="h-4" />
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--developer-board-lightning-20-regular] w-5 h-5" />
            <span>{t("game.events.linkedDevices")}</span>
          </h2>
          <For
            each={linkedDevices()}
            fallback={
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <span class="icon-[fluent--desktop-20-regular] w-24 h-24" />
                <span>{t("game.events.emptyDevices")}</span>
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
                  <span class="shrink-0">
                    <Switch fallback={device.connected_at.toFormat("MM-dd HH:mm")}>
                      <Match when={matches.sm}>{device.connected_at.toFormat("yyyy-MM-dd HH:mm:ss")}</Match>
                      <Match when={matches.xs}>{device.connected_at.toFormat("MM-dd HH:mm:ss")}</Match>
                    </Switch>
                  </span>
                </div>
              </>
            )}
          </For>
        </div>
        {/* <NarrowTips breakpoint="md" /> */}
      </div>
    </>
  );
}

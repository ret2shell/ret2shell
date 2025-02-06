import { WsrxState, wsrx } from "@lib/wsrx";
import type { Instance } from "@models/instance";
import { useLocation } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import TimeProgress from "@widgets/time-progress";
import Timer from "@widgets/timer";
import clsx from "clsx";
import { For, Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";

export function InstanceBoxContent() {
  const [connecting, setConnecting] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const location = useLocation();
  function challengeLink(i: Instance) {
    if (i.game_id !== gameStore.current?.id) {
      return "#";
    }
    if (location.pathname.startsWith("/training")) {
      return `/training/${i.game_id}?challenge=${i.challenge_id}`;
    }
    return `/games/${i.game_id}/challenges?challenge=${i.challenge_id}`;
  }

  function retryConnect() {
    wsrx.tryConnect().catch(() => {});
    setConnecting(true);
    setTimeout(async () => {
      await wsrx.checkConnection();
      setConnecting(false);
    }, 1000);
  }

  createEffect(() => {
    if (accountStore.token) untrack(retryConnect);
  });

  let cachedState = WsrxState.Disconnected;

  createEffect(() => {
    if (wsrx.connected() === WsrxState.Disconnected && cachedState !== WsrxState.Disconnected) {
      addToast({
        level: "warning",
        description: t("instance.wsrxDisconnected")!,
        duration: 10 * 1000,
      });
    }
    cachedState = wsrx.connected();
  });

  const heartbeatTimer = setInterval(async () => {
    // Pending or Connected
    if (wsrx.connected()) {
      const state = await wsrx.checkConnection();
      if (state === WsrxState.Connected) {
        wsrx.refreshTraffic();
      }
    }
  }, 5 * 1000);
  onCleanup(() => {
    clearInterval(heartbeatTimer);
  });
  return (
    <div class="flex flex-col space-y-2 max-w-96 w-[calc(100vw-1rem)]">
      <Card contentClass="p-2 flex flex-row space-x-2">
        <Button
          disabled={connecting()}
          loading={connecting() || wsrx.connected() === WsrxState.Pending}
          class="flex-1"
          justify="start"
          ghost
          title={t("instance.retryLinkWsrx")}
          size="sm"
          onClick={retryConnect}
        >
          <Show when={!connecting() && wsrx.connected() !== WsrxState.Pending}>
            <span
              class={clsx(
                "icon-[fluent--fluid-20-regular] w-5 h-5",
                wsrx.connected() === WsrxState.Connected ? "text-success" : "text-warning"
              )}
            />
          </Show>
          <span
            class={
              connecting()
                ? "text-base opacity-60"
                : wsrx.connected() === WsrxState.Connected
                  ? "text-success font-bold"
                  : "text-warning"
            }
          >
            {connecting()
              ? t("instance.connecting")
              : wsrx.connected() === WsrxState.Connected
                ? t("instance.connected")
                : wsrx.connected() === WsrxState.Pending
                  ? t("instance.pending")
                  : t("instance.disconnected")}
          </span>
        </Button>
        <Button
          ghost={!showSettings()}
          square
          title={t("instance.wsrxSettings")}
          size="sm"
          onClick={() => setShowSettings(!showSettings())}
        >
          {/* icon-[fluent--settings-20-regular] icon-[fluent--settings-20-filled] */}
          <span
            class={clsx(
              "icon-[fluent--settings-20-",
              showSettings() ? "filled" : "regular",
              "] w-5 h-5",
              showSettings() && "text-primary"
            )}
          />
        </Button>
        <Link
          href="https://github.com/XDSEC/WebSocketReflectorX/releases"
          ghost
          square
          target="_blank"
          title={t("instance.downloadWsrx")}
          size="sm"
        >
          <span class="icon-[fluent--arrow-download-20-regular] w-5 h-5" />
        </Link>
      </Card>
      <Show when={showSettings()}>
        <Card contentClass="p-2 flex flex-row space-x-2">
          <Input
            size="sm"
            class="flex-1"
            placeholder="http://127.0.0.1:3307"
            value={wsrx.apiAddr()}
            onBlur={(e) => {
              wsrx.setApiAddr(e.target.value);
            }}
          />
          <Button
            size="sm"
            square
            title={t("instance.defaultApiAddr")}
            ghost
            onClick={() => {
              wsrx.setApiAddr("http://127.0.0.1:3307");
            }}
          >
            <span class="icon-[fluent--arrow-reset-20-regular] w-5 h-5" />
          </Button>
          {/* NOTE: Just a placable button, when you click it, the input box will trigger `onBlur` to save it. */}
          <Button size="sm" square title={t("form.save")} ghost>
            <span class="icon-[fluent--checkmark-20-regular] w-5 h-5" />
          </Button>
        </Card>
      </Show>
      <For each={wsrx.instances()}>
        {(instance) => (
          <Card contentClass="p-2">
            <Link size="sm" ghost class="relative w-full" href={challengeLink(instance)}>
              <span class="icon-[fluent--play-circle-hint-20-regular] w-5 h-5 text-success" />
              <span class="flex-1 truncate text-start">{instance.challenge_name}</span>
              <Timer
                class="opacity-60"
                hasHours
                end={instance.created_at.plus({
                  hours: instance.renew_count + 1,
                })}
              />
              <TimeProgress
                class="absolute bottom-0 left-2 right-2"
                startAt={instance.created_at}
                endAt={instance.created_at.plus({
                  hours: instance.renew_count + 1,
                })}
              />
            </Link>
          </Card>
        )}
      </For>
    </div>
  );
}

export default function InstanceBox() {
  return (
    <Popover
      btnContent={
        <>
          <span class="icon-[fluent--fluid-20-regular] w-5 h-5" />
          {/* <span class="opacity-60">{t("instance.instanceCount", { count: wsrx.instances.length })}</span> */}
        </>
      }
      ghost
      square
      popContentClass="pt-2"
      title={t("instance.box")}
    >
      <InstanceBoxContent />
    </Popover>
  );
}

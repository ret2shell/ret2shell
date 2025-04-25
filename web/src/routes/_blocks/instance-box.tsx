import Spin from "@assets/animates/spin";
import { wsrx } from "@lib/wsrx";
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
import { WsrxError, WsrxErrorKind, WsrxState } from "@xdsec/wsrx";
import clsx from "clsx";
import { For, Show, createEffect, createSignal, untrack } from "solid-js";

export function InstanceBoxContent() {
  const [connecting, setConnecting] = createSignal(false);
  const [refreshingTraffic, setRefreshingTraffic] = createSignal(false);
  const [deletingAllTraffic, setDeletingAllTraffic] = createSignal(false);
  const [deletingOutdatedTraffic, setDeletingOutdatedTraffic] = createSignal(false);
  const [openingAllTraffic, setOpeningAllTraffic] = createSignal(false);
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

  async function tryConnect() {
    await wsrx.connect().catch(() => {});
  }

  async function retryConnect() {
    setConnecting(true);
    setTimeout(async () => {
      await wsrx.connect().catch((e) => {
        if (e instanceof WsrxError) {
          switch (e.kind) {
            case WsrxErrorKind.VersionMismatch:
              addToast({
                level: "error",
                description: t("instance.wsrxVersionMismatch")!,
                duration: 5000,
              });
              break;
            case WsrxErrorKind.DaemonError:
              addToast({
                level: "error",
                description: e.message!,
                duration: 5000,
              });
              break;
            case WsrxErrorKind.DaemonUnavailable:
              addToast({
                level: "error",
                description: t("instance.wsrxDaemonOffline")!,
                duration: 5000,
              });
              break;
          }
        }
      });
      setConnecting(false);
    }, 1000);
  }

  createEffect(() => {
    if (accountStore.token) untrack(tryConnect);
  });

  return (
    <div class="flex flex-col space-y-2 max-w-96 w-[calc(100vw-1rem)]">
      <Card contentClass="p-2 flex flex-row space-x-2">
        <Button
          disabled={connecting()}
          loading={connecting() || wsrx.state() === WsrxState.Pending}
          class="flex-1"
          justify="start"
          ghost
          title={t("instance.retryLinkWsrx")}
          size="sm"
          onClick={retryConnect}
        >
          <Show when={!connecting() && wsrx.state() !== WsrxState.Pending}>
            <span
              class={clsx(
                "icon-[fluent--fluid-20-regular] w-5 h-5",
                wsrx.state() === WsrxState.Usable ? "text-success" : "text-warning"
              )}
            />
          </Show>
          <span
            class={
              connecting()
                ? "text-base opacity-60"
                : wsrx.state() === WsrxState.Usable
                  ? "text-success font-bold"
                  : "text-warning"
            }
          >
            {connecting()
              ? t("instance.connecting")
              : wsrx.state() === WsrxState.Usable
                ? t("instance.connected")
                : wsrx.state() === WsrxState.Pending
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
              showSettings() ? "icon-[fluent--settings-20-filled]" : "icon-[fluent--settings-20-regular]",
              "w-5 h-5",
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
        <Card contentClass="p-2 flex flex-col space-y-2">
          <div class="flex flex-row w-full space-x-2">
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
            <Button size="sm" square title={t("form.save")} ghost onClick={retryConnect}>
              <span class="icon-[fluent--checkmark-20-regular] w-5 h-5" />
            </Button>
          </div>
          <div class="flex flex-row items-center space-x-2">
            <span class="flex-1 text-start font-bold px-2">{t("instance.wsrxTrafficConnection")}</span>
            <Button
              ghost
              square
              size="sm"
              class="flex"
              title={t("instance.refreshWsrxTraffic")}
              onClick={() => {
                setRefreshingTraffic(true);
                wsrx.syncLocal().finally(() => setRefreshingTraffic(false));
              }}
              disabled={refreshingTraffic()}
            >
              <Show
                when={refreshingTraffic()}
                fallback={<span class="icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />}
              >
                <Spin width={16} height={16} />
              </Show>
            </Button>
            <Button
              ghost
              square
              size="sm"
              class="flex"
              title={t("instance.openAllWsrxTraffic")}
              onClick={() => {
                setOpeningAllTraffic(true);
                wsrx
                  .openAllTraffic()
                  .then(() => wsrx.syncLocal())
                  .finally(() => setOpeningAllTraffic(false));
              }}
              disabled={openingAllTraffic()}
            >
              <Show when={openingAllTraffic()} fallback={<span class="icon-[fluent--connector-20-regular] w-5 h-5" />}>
                <Spin width={16} height={16} />
              </Show>
            </Button>
            <Button
              ghost
              square
              size="sm"
              class="flex"
              title={t("instance.deleteOutdatedWsrxTraffic")}
              onClick={() => {
                setDeletingOutdatedTraffic(true);
                wsrx
                  .deleteOutdatedLocal()
                  .then(() => wsrx.syncLocal())
                  .finally(() => setDeletingOutdatedTraffic(false));
              }}
              disabled={deletingOutdatedTraffic()}
            >
              <Show
                when={deletingOutdatedTraffic()}
                fallback={<span class="icon-[fluent--uninstall-app-20-regular] w-5 h-5" />}
              >
                <Spin width={16} height={16} />
              </Show>
            </Button>
            <Button
              ghost
              square
              size="sm"
              class="flex"
              title={t("instance.deleteAllWsrxTraffic")}
              onClick={() => {
                setDeletingAllTraffic(true);
                wsrx
                  .deleteAllLocal()
                  .then(() => wsrx.syncLocal())
                  .finally(() => setDeletingAllTraffic(false));
              }}
              disabled={deletingAllTraffic()}
            >
              <Show
                when={deletingAllTraffic()}
                fallback={<span class="icon-[fluent--uninstall-app-20-regular] text-warning w-5 h-5" />}
              >
                <Spin width={16} height={16} />
              </Show>
            </Button>
          </div>
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
                class="absolute bottom-[calc(var(--spacing)_*_-1)] left-2 right-2"
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

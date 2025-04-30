import { api_root, handleHttpError } from "@api";
import { getCalmdownStatus } from "@api/cluster";
import { delayGameSelfEnv, startChallengeEnv, stopGameSelfEnv } from "@api/game";
import Spin from "@assets/animates/spin";
import { getWsrxLink, wsrx } from "@lib/wsrx";
import { accountStore } from "@storage/account";
import { challengeStore, refreshStatus } from "@storage/challenge";
import { fullTheme, t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import ClipboardBtn from "@widgets/clipboard-btn";
import Divider from "@widgets/divider";
import Tag from "@widgets/tag";
import TimeProgress from "@widgets/time-progress";
import Timer from "@widgets/timer";
import { WsrxState } from "@xdsec/wsrx";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { passiveSupport } from "passive-events-support/src/utils";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import DownloadButton from "../download-button";

passiveSupport({
  events: ["mousewheel", "wheel"],
  listeners: [
    {
      element: "challenge-header",
      event: "wheel",
    },
  ],
});

export default function (props: { inGame?: boolean }) {
  const instance = createMemo(() => {
    if (challengeStore.current && challengeStore.env) {
      return wsrx.instances().find((s) => s.challenge_id === challengeStore.current!.id) ?? null;
    }
    return null;
  });
  const [calmdownStart, setCalmdownStart] = createSignal<DateTime | null>(null);
  async function refreshCalmdown() {
    try {
      const result = await getCalmdownStatus();
      setCalmdownStart(result);
    } catch {
      setCalmdownStart(null);
      return;
    }
  }
  createEffect(() => {
    if (challengeStore.current && challengeStore.env) {
      untrack(refreshCalmdown);
    }
  });
  createEffect(() => {
    if (challengeStore.current) {
      untrack(refreshStatus);
    }
  });

  let instanceStateIter = 0;
  async function maintainInstances() {
    await wsrx.syncRemote();
    await wsrx.deleteOutdatedLocal();
    await wsrx.openAllTraffic();
  }
  function maintainInstancesWorker() {
    if (instance()?.state === "Pending" || instanceStateIter === 0) {
      maintainInstances();
    }
    instanceStateIter++;
    instanceStateIter = instanceStateIter % 20;
    return maintainInstancesWorker;
  }
  const timer = setInterval(maintainInstancesWorker(), 1000);
  onCleanup(() => {
    clearInterval(timer);
  });
  const userExplicitInstance = createMemo(() => {
    if (challengeStore.current && challengeStore.env) {
      return wsrx.instances().find((s) => s.user_id === accountStore.id) ?? null;
    }
    return null;
  });

  createEffect(() => {
    if (wsrx.state() === WsrxState.Usable) {
      untrack(maintainInstances);
    }
  });

  const [starting, setStarting] = createSignal(false);
  async function handleStartChallengeEnv() {
    setStarting(true);
    try {
      await startChallengeEnv(challengeStore.current!.game_id, challengeStore.current!.id);
      setTimeout(() => {
        maintainInstances();
      }, 500);
    } catch (err) {
      handleHttpError(err as Error, t("challenge.instance.errors.start.title")!);
    }
    setStarting(false);
  }

  const [delaying, setDelaying] = createSignal(false);
  function handleDelaySelfEnv() {
    setDelaying(true);
    setTimeout(async () => {
      try {
        await delayGameSelfEnv(challengeStore.current!.game_id);
        setTimeout(() => {
          maintainInstances();
        }, 500);
      } catch (err) {
        handleHttpError(err as Error, t("challenge.instance.errors.delay.title")!);
      }
      setDelaying(false);
    }, 500);
  }
  const [stopping, setStopping] = createSignal(false);
  function handleStopSelfEnv() {
    setStopping(true);
    setTimeout(async () => {
      try {
        await stopGameSelfEnv(challengeStore.current!.game_id);
        setTimeout(() => {
          maintainInstances();
          refreshCalmdown();
        }, 500);
      } catch (err) {
        handleHttpError(err as Error, t("challenge.instance.errors.stop.title")!);
      }
      setStopping(false);
    }, 500);
  }
  return (
    <div class="w-full h-full overflow-hidden flex flex-col">
      <OverlayScrollbarsComponent
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: "scroll",
          },
        }}
        class="relative w-full flex-1 print:h-auto print:overflow-auto"
        defer
      >
        <div class="flex flex-col items-center p-3 lg:p-6">
          <div class="flex flex-col w-full max-w-5xl">
            <header class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 font-bold py-2 gap-y-2">
              <span class="flex flex-row space-x-2 items-center overflow-hidden">
                <span class="icon-[fluent--info-20-regular] w-5 h-5" />
                <span class="flex-1 truncate">{challengeStore.current?.name}</span>
              </span>
              <span class="flex-1" />
              <div class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-6">
                <Show when={props.inGame}>
                  <span
                    class={clsx(
                      "font-bold flex flex-row space-x-2 items-center",
                      challengeStore.status?.solved ? "text-success" : "text-warning"
                    )}
                  >
                    <span
                      class={
                        challengeStore.status?.solved
                          ? "icon-[fluent--checkmark-circle-20-regular] w-5 h-5"
                          : "icon-[fluent--flag-20-regular] w-5 h-5"
                      }
                    />
                    <span
                      class={
                        challengeStore.current?.archive_at && challengeStore.current.archive_at < DateTime.now()
                          ? "line-through"
                          : ""
                      }
                    >
                      {challengeStore.current?.score} pts
                    </span>
                  </span>
                </Show>
                <span class="font-bold flex flex-row space-x-2 items-center">
                  <span class="icon-[fluent--data-bar-vertical-24-regular] w-5 h-5" />
                  <span>
                    {challengeStore.status?.solves ?? 0} solve
                    {challengeStore.status?.solves && challengeStore.status.solves > 1 ? "s" : ""}
                  </span>
                </span>
              </div>
            </header>
            <Switch>
              <Match when={challengeStore.current?.release_at && challengeStore.current.release_at > DateTime.now()}>
                <section class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 py-2 gap-y-2">
                  <span class="flex flex-row space-x-2 items-center overflow-hidden">
                    <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-info" />
                    <span class="text-info flex-1 truncate text-start">{t("challenge.status.unreleased.message")}</span>
                  </span>
                  <span class="flex-1" />
                  <span class="text-end">
                    <span class="inline-block">{t("challenge.status.unreleased.countdown")}:</span>
                    <Timer end={challengeStore.current!.release_at!} hasHours />
                  </span>
                </section>
              </Match>
              <Match when={challengeStore.current?.archive_at && challengeStore.current.archive_at < DateTime.now()}>
                <section class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 py-2 gap-y-2">
                  <span class="flex flex-row space-x-2 items-center overflow-hidden">
                    <span class="icon-[fluent--archive-20-regular] w-5 h-5 text-warning" />
                    <span class="text-warning flex-1 truncate text-start">
                      {t("challenge.status.archived.message")}
                    </span>
                  </span>
                  <span class="flex-1" />
                  <span class="text-warning text-end">
                    <span class="inline-block">
                      {challengeStore.current?.release_at?.toFormat("yyyy-MM-dd HH:mm:ss")}
                    </span>
                    <span>&nbsp;-&nbsp;</span>
                    <span class="inline-block">
                      {challengeStore.current?.archive_at?.toFormat("yyyy-MM-dd HH:mm:ss")}
                    </span>
                  </span>
                </section>
              </Match>
              <Match when={challengeStore.current?.archive_at}>
                <section class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 py-2 gap-y-2">
                  <span class="flex flex-row space-x-2 items-center overflow-hidden">
                    <span class="icon-[fluent--clock-20-regular] w-5 h-5 text-info" />
                    <span class="text-info flex-1 truncate text-start">{t("challenge.status.inPeriod.message")}</span>
                  </span>
                  <span class="flex-1" />
                  <span class="text-end">
                    <span class="inline-block">{t("challenge.status.inPeriod.countdown")}:</span>
                    <Timer end={challengeStore.current!.archive_at!} hasHours />
                  </span>
                </section>
              </Match>
            </Switch>
            <Show when={challengeStore.files.length > 0}>
              <section class="inline-flex flex-row items-center flex-wrap min-h-12 border-b border-b-layer-content/15">
                <h3 class="font-bold flex space-x-2 items-center">
                  <span class="icon-[fluent--folder-zip-20-regular] w-5 h-5" />
                  <span>{t("challenge.file.title")}:</span>
                </h3>
                <div class="w-4" />
                <For each={challengeStore.files}>
                  {(file) => (
                    <DownloadButton
                      class="m-1"
                      size="sm"
                      file={file.file}
                      withFileName
                      icon="icon-[fluent--arrow-download-20-regular]"
                      url={`${api_root}/game/${challengeStore.current!.game_id}/challenge/${challengeStore.current!.id}/file`}
                      searchParams={{ file: file.file, folder: file.folder }}
                    />
                  )}
                </For>
              </section>
            </Show>
            <Show when={challengeStore.env}>
              <section class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 relative py-2 gap-y-2">
                <div class="flex flex-row items-center space-x-2 flex-nowrap whitespace-nowrap text-nowrap">
                  <h3 class="font-bold flex space-x-2 items-center flex-1">
                    <span
                      class={clsx(
                        "icon-[fluent--play-20-regular] w-5 h-5",
                        instance()?.state === "Running" && "text-success"
                      )}
                    />
                    <Switch
                      fallback={
                        <span class="opacity-80 flex-1 truncate">{t("challenge.instance.status.idle.title")}</span>
                      }
                    >
                      <Match when={instance()?.state === "Running"}>
                        <span class="flex-1 truncate">{t("challenge.instance.status.running.title")}</span>
                      </Match>
                      <Match when={instance()?.state === "Pending"}>
                        <Spin width={20} height={20} />
                        <span class="flex-1 truncate">{t("challenge.instance.status.pending.title")}</span>
                      </Match>
                      <Match when={instance()}>
                        <Spin width={20} height={20} />
                        <span class="flex-1 truncate text-error">{t("challenge.instance.status.failed.title")}</span>
                      </Match>
                      <Match when={userExplicitInstance()}>
                        <span class="text-warning flex-1 truncate">
                          {t("challenge.instance.status.inUse.title")}: {userExplicitInstance()?.challenge_name}
                        </span>
                      </Match>
                    </Switch>
                  </h3>
                </div>
                <span class="flex-1" />
                <div class="flex flex-row space-x-2 items-center">
                  <Switch
                    fallback={
                      <Button
                        ghost
                        size="sm"
                        onClick={handleStartChallengeEnv}
                        loading={starting()}
                        disabled={
                          starting() ||
                          calmdownStart() !== null ||
                          challengeStore.env?.images.every((image) => !image.port)
                        }
                      >
                        <Show
                          when={calmdownStart()}
                          fallback={
                            <>
                              <span class="icon-[fluent--play-20-regular] w-5 h-5 text-success" />
                              <span>{t("challenge.instance.actions.start.title")}</span>
                            </>
                          }
                        >
                          <span class="icon-[fluent--history-20-regular] w-5 h-5" />
                          <span class="opacity-60">{t("challenge.instance.errors.calmdown.title")}</span>
                          <Timer
                            end={calmdownStart()!.plus({ minutes: 1 })}
                            onTimeout={() => {
                              setTimeout(() => {
                                refreshCalmdown();
                              }, 500);
                            }}
                          />
                        </Show>
                      </Button>
                    }
                  >
                    <Match when={instance()}>
                      <div class="grid grid-cols-1 items-center justify-center px-4 relative">
                        <Timer
                          end={instance()!.created_at.plus({
                            hours: instance()!.renew_count + 1,
                          })}
                          onTimeout={() => {
                            setTimeout(() => {
                              maintainInstances();
                            }, 500);
                          }}
                          hasHours
                        />
                        <TimeProgress
                          class="w-full"
                          startAt={instance()!.created_at}
                          endAt={instance()!.created_at.plus({
                            hours: instance()!.renew_count + 1,
                          })}
                        />
                      </div>
                      <Divider class="h-8" direction="horizontal" />
                      <Show
                        when={instance()?.user_id === accountStore.id}
                        fallback={
                          <Button ghost size="sm">
                            <span class="icon-[fluent--lock-closed-20-regular] w-5 h-5 text-error" />
                            <span>{t("challenge.instance.errors.managedByMate.title")}</span>
                          </Button>
                        }
                      >
                        <Button
                          ghost
                          size="sm"
                          title={t("challenge.instance.actions.delay.title")}
                          square
                          onClick={handleDelaySelfEnv}
                          loading={delaying()}
                          disabled={delaying()}
                        >
                          <Show when={!delaying()}>
                            <span class="icon-[fluent--clock-alarm-20-regular] w-5 h-5 text-primary" />
                          </Show>
                        </Button>
                        <Button
                          ghost
                          size="sm"
                          title={t("challenge.instance.actions.stop.title")}
                          square
                          onClick={handleStopSelfEnv}
                          loading={stopping()}
                          disabled={stopping()}
                        >
                          <Show when={!stopping()}>
                            <span class="icon-[fluent--record-stop-20-regular] w-5 h-5 text-error" />
                          </Show>
                        </Button>
                      </Show>
                    </Match>
                    <Match when={userExplicitInstance()}>
                      <Button
                        ghost
                        size="sm"
                        square
                        title={t("challenge.instance.actions.stop.title")}
                        onClick={handleStopSelfEnv}
                        loading={stopping()}
                        disabled={stopping()}
                      >
                        <Show when={!stopping()}>
                          <span class="icon-[fluent--record-stop-20-regular] w-5 h-5 text-error" />
                        </Show>
                      </Button>
                    </Match>
                  </Switch>
                </div>
              </section>
              <Show when={instance()}>
                <For each={challengeStore.env?.images}>
                  {(image) => (
                    <Show when={image.port}>
                      <section
                        class={clsx(
                          "min-h-12 border-b border-b-layer-content/15 space-x-2 relative",
                          "flex flex-row items-center flex-wrap justify-end py-2 gap-y-2"
                        )}
                      >
                        <div class="flex flex-row items-center space-x-2 flex-nowrap whitespace-nowrap text-nowrap">
                          <span class="icon-[fluent--cube-20-regular] w-5 h-5 text-info" />
                          <span class="text-start space-x-2">
                            <span>{image.name}.service</span>
                            <span>-</span>
                            <span>{image.description}</span>
                          </span>
                          <Tag level="info">
                            <span>{image.service_type}</span>
                          </Tag>
                        </div>
                        <span class="flex-1" />
                        <Show when={wsrx.state() === WsrxState.Usable}>
                          <For each={wsrx.getTrafficLocal(instance()!, image.port!)}>
                            {(local) => (
                              <div class="flex">
                                <ClipboardBtn
                                  size="sm"
                                  class="!rounded-r-none"
                                  title={t("wsrx.actions.copyLocal.title")}
                                  value={local.local}
                                  label={local.local}
                                />
                                <Button size="sm" class="!rounded-l-none">
                                  <span
                                    class={clsx(
                                      (local.latency &&
                                        (local.latency < 0
                                          ? "text-error"
                                          : local.latency > 100
                                            ? "text-warning"
                                            : "text-success")) ??
                                        "text-error"
                                    )}
                                  >
                                    {(local.latency ?? -1) < 0 ? "--" : local.latency} ms
                                  </span>
                                </Button>
                              </div>
                            )}
                          </For>
                        </Show>
                        <Show
                          when={instance()?.exposed_ports?.find((v) => v.name === image.name)}
                          fallback={
                            <ClipboardBtn
                              size="sm"
                              icon="icon-[fluent--copy-add-20-regular]"
                              iconCopied="icon-[fluent--checkmark-circle-20-regular]"
                              title={t("wsrx.actions.copy.title")}
                              value={getWsrxLink(instance()!.traffic, image.port!)}
                              label="WSRX"
                            />
                          }
                        >
                          <ClipboardBtn
                            size="sm"
                            title={t("challenge.instance.actions.copy.title")}
                            value={instance()?.exposed_ports?.find((v) => v.name === image.name)?.address}
                            label={instance()?.exposed_ports?.find((v) => v.name === image.name)?.address}
                          />
                        </Show>
                      </section>
                    </Show>
                  )}
                </For>
              </Show>
            </Show>
            <Show when={challengeStore.current}>
              <div class="flex flex-row-reverse flex-wrap py-2">
                <For each={challengeStore.current!.tag}>
                  {(tag) => (
                    <Tag level={tag.primary ? "success" : "info"} class="m-1">
                      <span>{tag.name}</span>
                    </Tag>
                  )}
                </For>
              </div>
            </Show>
            <Article content={challengeStore.current?.content ?? ""} extra />
          </div>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}

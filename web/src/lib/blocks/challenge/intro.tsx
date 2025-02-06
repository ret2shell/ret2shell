import { api_root, handleHttpError } from "@api";
import { getCalmdownStatus } from "@api/cluster";
import { delayGameSelfEnv, startChallengeEnv, stopGameSelfEnv } from "@api/game";
import Spin from "@assets/animates/spin";
import { getWsrxLink, wsrx } from "@lib/wsrx";
import { accountStore } from "@storage/account";
import { challengeStore, refreshStatus } from "@storage/challenge";
import { fullTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Article from "@widgets/article";
import Button from "@widgets/button";
import ClipboardBtn from "@widgets/clipboard-btn";
import Divider from "@widgets/divider";
import Tag from "@widgets/tag";
import TimeProgress from "@widgets/time-progress";
import Timer from "@widgets/timer";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { passiveSupport } from "passive-events-support/src/utils";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import DownloadButton from "../download-button";
import clsx from "clsx";

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
    await wsrx.refreshInstances();
    await wsrx.deleteOutdatedTraffic();
    await wsrx.openAllTraffic();
    await wsrx.refreshTraffic();
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

  const [starting, setStarting] = createSignal(false);
  async function handleStartChallengeEnv() {
    setStarting(true);
    try {
      await startChallengeEnv(challengeStore.current!.game_id, challengeStore.current!.id);
      setTimeout(() => {
        maintainInstances();
      }, 500);
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.startEnvFailed")!);
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
        handleHttpError(err as Error, t("game.challenge.delayEnvFailed")!);
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
        addToast({
          level: "success",
          description: t("game.challenge.stopEnvSuccess")!,
          duration: 5000,
        });
        setTimeout(() => {
          maintainInstances();
          refreshCalmdown();
        }, 500);
      } catch (err) {
        handleHttpError(err as Error, t("game.challenge.stopEnvFailed")!);
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
            <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-6 font-bold">
              <span class="flex flex-row space-x-2 items-center flex-1 overflow-hidden">
                <span class="icon-[fluent--info-20-regular] w-5 h-5" />
                <span class="flex-1 truncate">{challengeStore.current?.name}</span>
              </span>
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
            </header>
            <Switch>
              <Match when={challengeStore.current?.release_at && challengeStore.current.release_at > DateTime.now()}>
                <section class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2">
                  <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-info" />
                  <span class="text-info flex-1 text-start">{t("game.challenge.notReleased")}</span>
                  <span>{t("game.challenge.releaseTips")}:</span>
                  <Timer end={challengeStore.current!.release_at!} hasHours />
                </section>
              </Match>
              <Match when={challengeStore.current?.archive_at && challengeStore.current.archive_at < DateTime.now()}>
                <section class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2">
                  <span class="icon-[fluent--archive-20-regular] w-5 h-5 text-warning" />
                  <span class="text-warning flex-1 truncate text-start">{t("game.challenge.archivedTips")}</span>
                  <span class="text-warning">
                    {challengeStore.current?.release_at?.toFormat("yyyy-MM-dd HH:mm:ss")}
                    &nbsp;-&nbsp;
                    {challengeStore.current?.archive_at?.toFormat("yyyy-MM-dd HH:mm:ss")}
                  </span>
                </section>
              </Match>
              <Match when={challengeStore.current?.archive_at}>
                <section class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2">
                  <span class="icon-[fluent--clock-20-regular] w-5 h-5 text-info" />
                  <span class="text-info flex-1 truncate text-start">{t("game.challenge.periodTips")}</span>
                  <span class="text-info">
                    {challengeStore.current?.release_at?.toFormat("yyyy-MM-dd HH:mm:ss")}
                    &nbsp;-&nbsp;
                    {challengeStore.current?.archive_at?.toFormat("yyyy-MM-dd HH:mm:ss")}
                  </span>
                </section>
              </Match>
            </Switch>
            <Show when={challengeStore.files.length > 0}>
              <section class="inline-flex flex-row items-center flex-wrap min-h-12 border-b border-b-layer-content/15">
                <h3 class="font-bold flex space-x-2 items-center">
                  <span class="icon-[fluent--folder-zip-20-regular] w-5 h-5" />
                  <span>{t("game.challenge.files")}:</span>
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
              <section class="h-12 border-b border-b-layer-content/15 flex flex-row items-center relative">
                <Show when={instance()}>
                  <TimeProgress
                    class="absolute bottom-0 left-0 right-0"
                    startAt={instance()!.created_at}
                    endAt={instance()!.created_at.plus({
                      hours: instance()!.renew_count + 1,
                    })}
                  />
                </Show>
                <h3 class="font-bold flex space-x-2 items-center flex-1">
                  <span
                    class={clsx(
                      "icon-[fluent--play-20-regular] w-5 h-5",
                      instance()?.state === "Running" && "text-success"
                    )}
                  />
                  <Switch fallback={<span class="opacity-80 flex-1 truncate">{t("game.challenge.envNotStart")}</span>}>
                    <Match when={instance()?.state === "Running"}>
                      <span class="flex-1 truncate">
                        {t("game.challenge.envIsRunning")}: {instance()?.traffic}
                      </span>
                    </Match>
                    <Match when={instance()?.state === "Pending"}>
                      <Spin width={20} height={20} />
                      <span class="flex-1 truncate">{t("game.challenge.envIsPending")}</span>
                    </Match>
                    <Match when={instance()}>
                      <Spin width={20} height={20} />
                      <span class="flex-1 truncate text-error">{t("game.challenge.envHasError")}</span>
                    </Match>
                    <Match when={userExplicitInstance()}>
                      <span class="text-warning flex-1 truncate">
                        {t("game.challenge.otherChallengeEnvIsRunning")}: {userExplicitInstance()?.challenge_name}
                      </span>
                    </Match>
                  </Switch>
                </h3>
                <div class="flex flex-row space-x-2 items-center">
                  <Switch
                    fallback={
                      <Button
                        ghost
                        size="sm"
                        onClick={handleStartChallengeEnv}
                        loading={starting()}
                        disabled={starting() || calmdownStart() !== null}
                      >
                        <Show
                          when={calmdownStart()}
                          fallback={
                            <>
                              <span class="icon-[fluent--play-20-regular] w-5 h-5 text-success" />
                              <span>{t("game.challenge.startEnv")}</span>
                            </>
                          }
                        >
                          <span class="icon-[fluent--history-20-regular] w-5 h-5" />
                          <span class="opacity-60">{t("game.challenge.calmDownBeforeStartEnv")}</span>
                          <Timer
                            end={calmdownStart()!.plus({ minutes: 1 })}
                            onTimeout={() => {
                              setTimeout(() => {
                                refreshCalmdown();
                              }, 1500);
                            }}
                          />
                        </Show>
                      </Button>
                    }
                  >
                    <Match when={instance()}>
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
                      <Divider class="h-8" direction="horizontal" />
                      <Button
                        ghost
                        size="sm"
                        title={t("game.challenge.delayEnv")}
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
                        title={t("game.challenge.stopEnv")}
                        square
                        onClick={handleStopSelfEnv}
                        loading={stopping()}
                        disabled={stopping()}
                      >
                        <Show when={!stopping()}>
                          <span class="icon-[fluent--record-stop-20-regular] w-5 h-5 text-error" />
                        </Show>
                      </Button>
                    </Match>
                    <Match when={userExplicitInstance()}>
                      <Button
                        ghost
                        size="sm"
                        square
                        title={t("game.challenge.stopEnv")}
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
                      <section class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 relative">
                        <span class="icon-[fluent--cube-20-regular] w-5 h-5 text-info" />
                        <span class="flex-1 text-start space-x-2">
                          <span>{image.name}.service</span>
                          <span>-</span>
                          <span>{image.description}</span>
                        </span>
                        <Tag level="info">
                          <span>{image.service_type}</span>
                        </Tag>
                        <Switch
                          fallback={
                            <ClipboardBtn
                              size="sm"
                              title={image.description!}
                              value={getWsrxLink(instance()!.traffic, image.port!)}
                              label="WebSocket"
                            />
                          }
                        >
                          <Match when={instance()?.exposed_ports?.find((v) => v.name === image.name)}>
                            <ClipboardBtn
                              size="sm"
                              title={image.description!}
                              value={instance()?.exposed_ports?.find((v) => v.name === image.name)?.address}
                              label={instance()?.exposed_ports?.find((v) => v.name === image.name)?.address}
                            />
                          </Match>
                          <Match when={wsrx.getTrafficLocal(instance()!, image.port!)}>
                            <ClipboardBtn
                              size="sm"
                              title={image.description!}
                              value={getWsrxLink(instance()!.traffic, image.port!)}
                              label="WebSocket"
                            />
                            <ClipboardBtn
                              size="sm"
                              title={image.description!}
                              value={wsrx.getTrafficLocal(instance()!, image.port!)?.local}
                              label={wsrx.getTrafficLocal(instance()!, image.port!)?.local}
                            />
                          </Match>
                        </Switch>
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

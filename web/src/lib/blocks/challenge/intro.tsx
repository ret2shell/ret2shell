import { api_root } from "@api";
import {
  useChallenge,
  useChallengeAttachments,
  useChallengeEnv,
  useChallengeSolveStatus,
  useDelayChallengeInstanceMutation,
  useStartChallengeInstanceMutation,
  useStopChallengeInstanceMutation,
} from "@api/challenge";
import { useCalmdownStatus } from "@api/cluster";
import { useGame, useGameInstances } from "@api/game";
import { useSelfTeam } from "@api/team";
import Spin from "@assets/animates/spin";
import { getWsrxLink, wsrx } from "@lib/wsrx";
import { isAdminOfGame, isGameInProgress } from "@storage/game";
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
import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js";
import DownloadButton from "../download-button";
import type { ChallengeWidgetProps } from ".";

passiveSupport({
  events: ["mousewheel", "wheel"],
  listeners: [
    {
      element: "challenge-header",
      event: "wheel",
    },
  ],
});

export default function (props: ChallengeWidgetProps) {
  const instances = useGameInstances({ game_id: () => props.gameId });
  const instance = createMemo(() => {
    return instances.data?.find((s) => s.challenge_id === props.challengeId) ?? null;
  });
  const calmdownStatus = useCalmdownStatus();
  const game = useGame({ id: () => props.gameId });
  const challenge = useChallenge({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });
  const attachments = useChallengeAttachments({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });
  const env = useChallengeEnv({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });
  const solveStatus = useChallengeSolveStatus({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });
  const team = useSelfTeam({
    game_id: () => props.gameId,
    enabled: () => !props.training && !!game.data && isGameInProgress(game.data) && !isAdminOfGame(game.data),
  });

  let instanceStateIter = 0;
  async function maintainInstances() {
    await instances.refetch();
    await wsrx.deleteOutdatedLocal(instances.data);
    await wsrx.openAllTraffic(instances.data);
  }
  function maintainInstancesWorker() {
    if (instance()?.state === "Pending" || instanceStateIter === 0) {
      maintainInstances();
    }
    instanceStateIter++;
    instanceStateIter = instanceStateIter % 20;
    return maintainInstancesWorker;
  }
  const instanceCountExceeded = createMemo(() => {
    return (
      instances.data &&
      instances.data.length >= (isGameInProgress(game.data) && team.data ? (game.data?.team_size ?? 1) : 1)
    );
  });

  const timer = setInterval(maintainInstancesWorker(), 1000);
  onCleanup(() => {
    clearInterval(timer);
  });

  createEffect(() => {
    if (wsrx.state() === WsrxState.Usable) {
      untrack(maintainInstances);
    }
  });

  const startInstanceMutation = useStartChallengeInstanceMutation({
    onSuccess: () => {
      setTimeout(() => {
        maintainInstances();
      }, 500);
    },
  });
  async function handleStartChallengeInstance() {
    startInstanceMutation.mutate({
      game_id: props.gameId,
      challenge_id: props.challengeId,
    });
  }

  const delayInstanceMutation = useDelayChallengeInstanceMutation({
    onSuccess: () => {
      setTimeout(() => {
        maintainInstances();
      }, 500);
    },
  });

  function handleDelayChallengeInstance() {
    delayInstanceMutation.mutate({
      game_id: props.gameId,
      challenge_id: props.challengeId,
    });
  }

  const stopInstanceMutation = useStopChallengeInstanceMutation({
    onSuccess: () => {
      setTimeout(() => {
        maintainInstances();
        calmdownStatus.refetch();
      }, 500);
    },
  });
  function handleStopChallengeInstance() {
    stopInstanceMutation.mutate({
      game_id: props.gameId,
      challenge_id: props.challengeId,
    });
  }

  const [stoppingExplicit, setStoppingExplicit] = createSignal(0);
  async function handleStopChallengeInstanceExplicit(game_id: number, id: number) {
    setStoppingExplicit(id);
    stopInstanceMutation.mutate({
      game_id: game_id,
      challenge_id: id,
    });
    await maintainInstances();
    await calmdownStatus.refetch();
    setStoppingExplicit(0);
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
                <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />
                <span class="flex-1 truncate">{challenge.data?.name}</span>
              </span>
              <span class="flex-1" />
              <div class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-6">
                <Show when={!props.training}>
                  <span
                    class={clsx(
                      "font-bold flex flex-row space-x-2 items-center",
                      solveStatus.data?.solved ? "text-success" : "text-warning"
                    )}
                  >
                    <span
                      class={
                        solveStatus.data?.solved
                          ? "icon-[fluent--checkmark-circle-20-regular] w-5 h-5"
                          : "icon-[fluent--flag-20-regular] w-5 h-5"
                      }
                    />
                    <span
                      class={
                        challenge.data?.archive_at && challenge.data.archive_at < DateTime.now() ? "line-through" : ""
                      }
                    >
                      {challenge.data?.score} pts
                    </span>
                  </span>
                </Show>
                <span class="font-bold flex flex-row space-x-2 items-center">
                  <span class="shrink-0 icon-[fluent--data-bar-vertical-24-regular] w-5 h-5" />
                  <span>
                    {solveStatus.data?.solves ?? 0} solve
                    {solveStatus.data?.solves && solveStatus.data.solves > 1 ? "s" : ""}
                  </span>
                </span>
              </div>
            </header>
            <Switch>
              <Match when={challenge.data?.release_at && challenge.data.release_at > DateTime.now()}>
                <section class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 py-2 gap-y-2">
                  <span class="flex flex-row space-x-2 items-center overflow-hidden">
                    <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5 text-info" />
                    <span class="text-info flex-1 truncate text-start">{t("challenge.status.unreleased.message")}</span>
                  </span>
                  <span class="flex-1" />
                  <span class="text-end">
                    <span class="inline-block">{t("challenge.status.unreleased.countdown")}:</span>
                    <Timer end={challenge.data?.release_at || DateTime.now()} hasHours />
                  </span>
                </section>
              </Match>
              <Match when={challenge.data?.archive_at && challenge.data.archive_at < DateTime.now()}>
                <section class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 py-2 gap-y-2">
                  <span class="flex flex-row space-x-2 items-center overflow-hidden">
                    <span class="shrink-0 icon-[fluent--archive-20-regular] w-5 h-5 text-warning" />
                    <span class="text-warning flex-1 truncate text-start">
                      {t("challenge.status.archived.message")}
                    </span>
                  </span>
                  <span class="flex-1" />
                  <span class="text-warning text-end">
                    <span class="inline-block">{challenge.data?.release_at?.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                    <span>&nbsp;-&nbsp;</span>
                    <span class="inline-block">{challenge.data?.archive_at?.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                  </span>
                </section>
              </Match>
              <Match when={challenge.data?.archive_at}>
                <section class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 py-2 gap-y-2">
                  <span class="flex flex-row space-x-2 items-center overflow-hidden">
                    <span class="shrink-0 icon-[fluent--clock-20-regular] w-5 h-5 text-info" />
                    <span class="text-info flex-1 truncate text-start">{t("challenge.status.inPeriod.message")}</span>
                  </span>
                  <span class="flex-1" />
                  <span class="text-end">
                    <span class="inline-block">{t("challenge.status.inPeriod.countdown")}:</span>
                    <Timer end={challenge.data?.archive_at || DateTime.now()} hasHours />
                  </span>
                </section>
              </Match>
            </Switch>
            <Show when={attachments.data && attachments.data.length > 0}>
              <section class="inline-flex flex-row items-center flex-wrap min-h-12 border-b border-b-layer-content/15">
                <h3 class="font-bold flex space-x-2 items-center">
                  <span class="shrink-0 icon-[fluent--folder-zip-20-regular] w-5 h-5" />
                  <span>{t("challenge.file.title")}:</span>
                </h3>
                <div class="w-4" />
                <For each={attachments.data}>
                  {(file) => (
                    <DownloadButton
                      class="m-1"
                      size="sm"
                      file={file.file}
                      withFileName
                      icon="icon-[fluent--arrow-download-20-regular]"
                      url={`${api_root}/game/${challenge.data!.game_id}/challenge/${challenge.data!.id}/file`}
                      searchParams={{ file: file.file, folder: file.folder }}
                    />
                  )}
                </For>
              </section>
            </Show>
            <Show when={env.data}>
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
                      <Match when={instanceCountExceeded()}>
                        <span class="text-warning flex-1 truncate">
                          {t("challenge.instance.errors.singleton.title")}
                        </span>
                      </Match>
                    </Switch>
                  </h3>
                </div>
                <span class="flex-1" />
                <Switch
                  fallback={
                    <Button
                      ghost
                      size="sm"
                      onClick={handleStartChallengeInstance}
                      loading={startInstanceMutation.isPending}
                      disabled={
                        startInstanceMutation.isPending ||
                        !!calmdownStatus.data ||
                        env.data?.images.every((image) => !image.port)
                      }
                    >
                      <Show
                        when={calmdownStatus.data}
                        fallback={
                          <>
                            <span class="shrink-0 icon-[fluent--play-20-regular] w-5 h-5 text-success" />
                            <span>{t("challenge.instance.actions.start.title")}</span>
                          </>
                        }
                      >
                        <span class="shrink-0 icon-[fluent--history-20-regular] w-5 h-5" />
                        <span class="opacity-60">{t("challenge.instance.errors.calmdown.title")}</span>
                        <Timer
                          end={calmdownStatus.data!.plus({ minutes: 1 })}
                          onTimeout={() => {
                            setTimeout(() => {
                              calmdownStatus.refetch();
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
                    <Button
                      ghost
                      size="sm"
                      title={t("challenge.instance.actions.delay.title")}
                      square
                      onClick={handleDelayChallengeInstance}
                      loading={delayInstanceMutation.isPending}
                      disabled={delayInstanceMutation.isPending}
                    >
                      <Show when={!delayInstanceMutation.isPending}>
                        <span class="shrink-0 icon-[fluent--clock-alarm-20-regular] w-5 h-5 text-primary" />
                      </Show>
                    </Button>
                    <Button
                      ghost
                      size="sm"
                      title={t("challenge.instance.actions.stop.title")}
                      square
                      onClick={handleStopChallengeInstance}
                      loading={stopInstanceMutation.isPending}
                      disabled={stopInstanceMutation.isPending}
                    >
                      <Show when={!stopInstanceMutation.isPending}>
                        <span class="shrink-0 icon-[fluent--record-stop-20-regular] w-5 h-5 text-error" />
                      </Show>
                    </Button>
                  </Match>
                  <Match when={instanceCountExceeded()}>
                    <For each={instances.data}>
                      {(inst) => (
                        <Button
                          ghost
                          size="sm"
                          title={t("challenge.instance.actions.stop.title")}
                          disabled={stopInstanceMutation.isPending || !!stoppingExplicit()}
                          loading={stoppingExplicit() === inst.challenge_id}
                          onClick={() => handleStopChallengeInstanceExplicit(inst.game_id, inst.challenge_id)}
                        >
                          <Show when={stoppingExplicit() !== inst.challenge_id}>
                            <span class="shrink-0 icon-[fluent--record-stop-20-regular] w-5 h-5 text-error" />
                          </Show>
                          <span>{inst.challenge_name}</span>
                        </Button>
                      )}
                    </For>
                  </Match>
                </Switch>
              </section>
              <Show when={instance()}>
                <For each={env.data?.images}>
                  {(image) => (
                    <Show when={image.port}>
                      <section
                        class={clsx(
                          "min-h-12 border-b border-b-layer-content/15 space-x-2 relative",
                          "flex flex-row items-center flex-wrap justify-end py-2 gap-y-2"
                        )}
                      >
                        <div class="flex flex-row items-center space-x-2 flex-nowrap whitespace-nowrap text-nowrap">
                          <span class="shrink-0 icon-[fluent--cube-20-regular] w-5 h-5 text-info" />
                          <span class="text-start space-x-2">
                            <span>{image.name}.service</span>
                            <span>-</span>
                            <span>{image.description}</span>
                          </span>
                          <Tag level="info">
                            <span>
                              {image.protocol || image.service_type || "tcp"}({image.app_protocol || "raw"})
                            </span>
                          </Tag>
                        </div>
                        <span class="flex-1" />
                        <Show when={wsrx.state() === WsrxState.Usable}>
                          <For each={wsrx.getTrafficLocal(instance()!, image.port!)}>
                            {(local) => (
                              <div class="flex">
                                <ClipboardBtn
                                  size="sm"
                                  class="rounded-r-none!"
                                  title={t("wsrx.actions.copyLocal.title")}
                                  value={local.local}
                                  label={local.local}
                                />
                                <Button size="sm" class="rounded-l-none!">
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
            <Show when={challenge.data}>
              <div class="flex flex-row-reverse flex-wrap py-2">
                <For each={challenge.data!.tag}>
                  {(tag) => (
                    <Tag level={tag.primary ? "success" : "info"} class="m-1">
                      <span>{tag.name}</span>
                    </Tag>
                  )}
                </For>
              </div>
            </Show>
            <Article content={challenge.data?.content ?? ""} extra />
          </div>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}

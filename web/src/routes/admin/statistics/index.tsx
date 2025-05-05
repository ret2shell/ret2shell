import { handleHttpError } from "@api";
import { type PlatformStatistics, getPlatformStatistics } from "@api/platform";
import LogoAnimate from "@assets/animates/logo-animate";
import Spin from "@assets/animates/spin";
import { HostType } from "@models/game";
import { Title } from "@storage/header";
import { platformStore } from "@storage/platform";
import { t } from "@storage/theme";
import Chart from "@widgets/chart";
import Divider from "@widgets/divider";
import { DateTime } from "luxon";
import { Show, createSignal, onMount } from "solid-js";

export default function () {
  const [loading, setLoading] = createSignal(true);
  const [statistics, setStatistics] = createSignal(null as null | PlatformStatistics);
  onMount(async () => {
    try {
      const resp = await getPlatformStatistics();
      setStatistics(resp);
    } catch (err) {
      handleHttpError(err as Error, t("platform.statistics.errors.fetch.title")!);
    }
    setLoading(false);
  });

  return (
    <>
      <Title page={t("platform.statistics.title")} route="/admin/statistics" />
      <div class="flex-1 grid grid-cols-1 md:grid-cols-6 p-3 lg:p-6 gap-3 lg:gap-6">
        <div class="flex md:col-span-6 lg:col-span-3 items-center justify-start space-x-12 px-3 lg:px-6 xl:px-9">
          <LogoAnimate class="m-0 w-16 h-16 md:w-32 md:h-32 xl:w-36 xl:h-36" />
          <h1 class="ml-6 text-2xl md:text-4xl xl:text-5xl font-bold">
            {platformStore.config.name || t("platform.name")!}
          </h1>
        </div>
        <Divider class="flex col-span-1 md:col-span-6 lg:hidden" />
        <div class="col-span-1 md:col-span-3 xl:col-span-3 h-48 p-3 xl:p-6 dir-ltr lg:dir-rtl flex flex-row items-center self-center max-md:justify-self-center max-md:min-w-[50vw] space-x-8">
          <div class="h-full aspect-square flex items-center justify-center">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: "16px",
                    right: "16px",
                    bottom: "16px",
                    top: "16px",
                  },
                  tooltip: {
                    show: true,
                  },
                  series: {
                    type: "sunburst",
                    emphasis: {
                      focus: "ancestor",
                    },
                    label: {
                      show: false,
                    },
                    name: t("game.title"),
                    data: [
                      {
                        value: statistics()!.games.length === 0 ? 1 : 0,
                        itemStyle: {
                          color: "#808080",
                        },
                      },
                      {
                        value:
                          (statistics()!.games.filter((g) => g.host_type === HostType.Training).length *
                            statistics()!
                              .games.filter((g) => g.host_type === HostType.Game)
                              .reduce((a, b) => a + b.teams, 0)) /
                          statistics()!.games.length,
                        name: t("training.title"),
                        itemStyle: {
                          color: "#0991ed",
                        },
                      },
                      {
                        value: statistics()!
                          .games.filter((g) => g.host_type === HostType.Game)
                          .reduce((a, b) => a + b.teams, 0),
                        name: t("game.title"),
                        itemStyle: {
                          color: "#e05864",
                        },
                        children: [
                          {
                            itemStyle: {
                              color: "#0991ed",
                            },
                            name: t("game.pending"),
                            value: statistics()!
                              .games.filter((g) => g.host_type === HostType.Game && g.start_at > DateTime.now())
                              .reduce((a, b) => a + b.teams, 0),
                            children: statistics()!
                              .games.filter((g) => g.host_type === HostType.Game && g.start_at > DateTime.now())
                              .map((g) => ({
                                value: g.teams,
                                name: g.name,
                              })),
                          },
                          {
                            itemStyle: {
                              color: "#17a750",
                            },
                            name: t("game.started"),
                            value: statistics()!
                              .games.filter(
                                (g) =>
                                  g.host_type === HostType.Game &&
                                  g.start_at < DateTime.now() &&
                                  g.end_at > DateTime.now()
                              )
                              .reduce((a, b) => a + b.teams, 0),
                            children: statistics()!
                              .games.filter(
                                (g) =>
                                  g.host_type === HostType.Game &&
                                  g.start_at < DateTime.now() &&
                                  g.end_at > DateTime.now()
                              )
                              .map((g) => ({
                                value: g.teams,
                                name: g.name,
                              })),
                          },
                          {
                            itemStyle: {
                              color: "#808080",
                            },
                            name: t("game.ended"),
                            value: statistics()!
                              .games.filter((g) => g.host_type === HostType.Game && g.end_at < DateTime.now())
                              .reduce((a, b) => a + b.teams, 0),
                            children: statistics()!
                              .games.filter((g) => g.host_type === HostType.Game && g.end_at < DateTime.now())
                              .map((g) => ({
                                value: g.teams,
                                name: g.name,
                              })),
                          },
                        ],
                      },
                    ],
                    levels: [
                      {},
                      {
                        r0: "20%",
                        r: "50%",
                      },
                      {
                        r0: "50%",
                        r: "70%",
                      },
                      {
                        r0: "70%",
                        r: "80%",
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
          <div class="flex flex-col space-y-4 dir-ltr">
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--dumbbell-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl text-info">
                {statistics()?.games.filter((g) => g.host_type === HostType.Training).length}
              </span>
              <span class="opacity-60">{t("training.title")}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--flag-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl text-error">
                {statistics()?.games.filter((g) => g.host_type === HostType.Game).length}
              </span>
              <span class="opacity-60">{t("game.title")}</span>
            </div>
          </div>
        </div>
        <Divider class="hidden col-span-6 lg:flex" />
        <div class="col-span-1 md:col-span-3 lg:col-span-2 h-32 lg:h-48 p-3 lg:p-6 flex flex-row items-center self-center max-md:justify-self-center max-md:w-xs max-md:max-w-full space-x-8">
          <div class="h-full aspect-square flex items-center justify-center lg:max-xl:me-0">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: "16px",
                    right: "16px",
                    bottom: "16px",
                    top: "16px",
                  },
                  series: {
                    type: "sunburst",
                    emphasis: {
                      focus: "ancestor",
                    },
                    data: [
                      {
                        itemStyle: {
                          color: "#0991ed",
                        },
                        value: statistics()!.users.valid,
                      },
                      {
                        value: statistics()!.users.total - statistics()!.users.valid,
                        itemStyle: {
                          color: "#db640e",
                        },
                      },
                    ],
                    levels: [
                      {},
                      {
                        r0: "40%",
                        r: "80%",
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
          <div class="flex-1 flex flex-col space-y-2 lg:space-y-4">
            <h3 class="font-bold flex items-center space-x-2">{t("user.title")}</h3>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--emoji-sparkle-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl text-info">{statistics()?.users.valid}</span>
              <span class="opacity-60">{t("user.status.valid.title")}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--person-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl">{statistics()?.users.total}</span>
              <span class="opacity-60">{t("user.total")}</span>
            </div>
          </div>
        </div>
        <div class="col-span-1 md:col-span-3 lg:col-span-2 h-32 lg:h-48 p-3 lg:p-6 flex flex-row items-center self-center max-md:justify-self-center max-md:w-xs max-md:max-w-full space-x-8">
          <div class="h-full aspect-square flex items-center justify-center lg:max-xl:me-0">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: "16px",
                    right: "16px",
                    bottom: "16px",
                    top: "16px",
                  },
                  toolbox: {},
                  series: {
                    type: "sunburst",
                    emphasis: {
                      focus: "ancestor",
                    },
                    data: [
                      {
                        itemStyle: {
                          color: "#db640e",
                        },
                        value: statistics()!.challenges.in_game,
                      },
                      {
                        value: statistics()!.challenges.total - statistics()!.challenges.in_game,
                        itemStyle: {
                          color: "#0991ed",
                        },
                      },
                      {
                        value: statistics()!.challenges.total === 0 ? 1 : 0,
                        itemStyle: {
                          color: "#808080",
                        },
                      },
                    ],
                    levels: [
                      {},
                      {
                        r0: "40%",
                        r: "80%",
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
          <div class="flex-1 flex flex-col space-y-2 lg:space-y-4">
            <h3 class="font-bold flex items-center space-x-2">{t("challenge.title")}</h3>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--code-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl text-warning">{statistics()?.challenges.in_game}</span>
              <span class="opacity-60">{t("challenge.inGame")}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--target-edit-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl">{statistics()?.challenges.total}</span>
              <span class="opacity-60">{t("challenge.total")}</span>
            </div>
          </div>
        </div>
        <div class="col-span-1 md:col-span-3 lg:col-span-2 h-32 lg:h-48 p-3 lg:p-6 flex flex-row items-center self-center max-md:justify-self-center max-md:w-xs max-md:max-w-full space-x-8">
          <div class="h-full aspect-square flex items-center justify-center lg:max-xl:me-0">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: "16px",
                    right: "16px",
                    bottom: "16px",
                    top: "16px",
                  },
                  toolbox: {},
                  series: {
                    type: "sunburst",
                    emphasis: {
                      focus: "ancestor",
                    },
                    data: [
                      {
                        itemStyle: {
                          color: "#17a750",
                        },
                        value: statistics()!.submissions.solved,
                      },
                      {
                        value: statistics()!.submissions.total - statistics()!.submissions.solved,
                        itemStyle: {
                          color: "#db640e",
                        },
                      },
                      {
                        value: statistics()!.submissions.total === 0 ? 1 : 0,
                        itemStyle: {
                          color: "#808080",
                        },
                      },
                    ],
                    levels: [
                      {},
                      {
                        r0: "40%",
                        r: "80%",
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
          <div class="flex-1 flex flex-col space-y-2 lg:space-y-4">
            <h3 class="font-bold flex items-center space-x-2">{t("challenge.submission.title")}</h3>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--checkmark-starburst-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl text-success">{statistics()?.submissions.solved}</span>
              <span class="opacity-60">{t("challenge.submission.status.solved.title")}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--text-bullet-list-20-regular] w-8 h-8 opacity-80" />
              <span class="font-bold text-3xl">{statistics()?.submissions.total}</span>
              <span class="opacity-60">{t("challenge.submission.total")}</span>
            </div>
          </div>
        </div>
        <div class="col-span-1 md:col-span-6 min-h-64 lg:min-h-80 p-3 lg:p-6 flex flex-row items-center">
          <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
            <Chart
              option={{
                grid: {
                  left: "64px",
                  right: "32px",
                  bottom: "32px",
                  top: "48px",
                },
                title: {
                  text: t("platform.statistics.instituteUsers.title")!,
                  right: "center",
                },
                tooltip: {
                  trigger: "axis",
                  axisPointer: {
                    type: "line",
                    label: {
                      precision: 0,
                    },
                    snap: true,
                  },
                  borderColor: "transparent",
                },
                toolbox: {},
                xAxis: {
                  type: "category",
                  data: statistics()!
                    .users.institutes.map((i) => statistics()!.institutes.find((ii) => ii.id === i[0])!.name)
                    .concat(t("platform.statistics.instituteUsers.others")!),
                },
                yAxis: {
                  type: "value",
                  min: 0,
                },
                series: {
                  type: "bar",
                  data: statistics()!
                    .users.institutes.map((i) => i[1])
                    .concat(statistics()!.users.total - statistics()!.users.institutes.reduce((a, b) => a + b[1], 0)),
                  barMaxWidth: 64,
                },
              }}
            />
          </Show>
        </div>
      </div>
    </>
  );
}

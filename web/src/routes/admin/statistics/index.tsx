import { PlatformStatistics, getPlatformStatistics } from '@/lib/api/platform'
import LogoAnimate from '@/lib/assets/animates/logo-animate'
import Spin from '@/lib/assets/animates/spin'
import { HostType } from '@/lib/models/game'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import Card from '@/lib/widgets/card'
import Chart from '@/lib/widgets/chart'
import Divider from '@/lib/widgets/divider'
import { HTTPError } from '@reverier/ky'
import { DateTime } from 'luxon'
import { Show, createSignal } from 'solid-js'

export default function () {
  const [loading, setLoading] = createSignal(false)
  const [statistics, setStatistics] = createSignal(null as null | PlatformStatistics)
  setLoading(true)
  getPlatformStatistics()
    .then(resp => {
      setStatistics(resp)
    })
    .catch((err: HTTPError) => {
      void err.response.text().then(text => {
        addToast({
          level: 'error',
          description: `${t('admin.statistics.fetchFailed')}: ${text}`,
          duration: 5000,
        })
      })
    })
    .finally(() => setLoading(false))
  return (
    <>
      <Title title={`${t('admin.statistics.title')} - ${platformStore.config.name || t('platform.name')}`}></Title>
      <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 p-3 lg:p-6 gap-3 lg:gap-6">
        <div class="hidden xl:flex xl:col-span-2 items-center justify-start space-x-12 px-12">
          <LogoAnimate class="w-36 h-36" />
          <h1 class="text-5xl font-bold">{platformStore.config.name || t('platform.name')!}</h1>
        </div>
        <div class="col-span-1 h-48 p-6 flex flex-row items-center space-x-8">
          <div class="flex-1 flex flex-col space-y-4">
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--dumbbell-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl text-info">
                {statistics()?.games.filter(g => g.host_type === HostType.CTFTraining).length}
              </span>
              <span class="opacity-60">{t('admin.statistics.trainings')}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--flag-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl text-error">
                {statistics()?.games.filter(g => g.host_type === HostType.CTFGame).length}
              </span>
              <span class="opacity-60">{t('admin.statistics.totalGames')}</span>
            </div>
          </div>
          <div class="h-full aspect-square flex items-center justify-center">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: '16px',
                    right: '16px',
                    bottom: '16px',
                    top: '16px',
                  },
                  tooltip: {
                    show: true,
                  },
                  series: {
                    type: 'sunburst',
                    emphasis: {
                      focus: 'ancestor',
                    },
                    label: {
                      show: false,
                    },
                    name: t('game.title'),
                    data: [
                      {
                        value: statistics()!.games.length === 0 ? 1 : 0,
                        itemStyle: {
                          color: '#808080',
                        },
                      },
                      {
                        value:
                          (statistics()!.games.filter(g => g.host_type === HostType.CTFTraining).length *
                            statistics()!
                              .games.filter(g => g.host_type === HostType.CTFGame)
                              .reduce((a, b) => a + b.teams, 0)) /
                          statistics()!.games.length,
                        name: t('admin.statistics.trainings'),
                        itemStyle: {
                          color: '#0991ed',
                        },
                      },
                      {
                        value: statistics()!
                          .games.filter(g => g.host_type === HostType.CTFGame)
                          .reduce((a, b) => a + b.teams, 0),
                        name: t('admin.statistics.games'),
                        itemStyle: {
                          color: '#e05864',
                        },
                        children: [
                          {
                            itemStyle: {
                              color: '#0991ed',
                            },
                            name: t('admin.statistics.pendingGames'),
                            value: statistics()!
                              .games.filter(g => g.host_type === HostType.CTFGame && g.start_at > DateTime.now())
                              .reduce((a, b) => a + b.teams, 0),
                            children: statistics()!
                              .games.filter(g => g.host_type === HostType.CTFGame && g.start_at > DateTime.now())
                              .map(g => ({
                                value: g.teams,
                                name: g.name,
                              })),
                          },
                          {
                            itemStyle: {
                              color: '#17a750',
                            },
                            name: t('admin.statistics.inProgressGames'),
                            value: statistics()!
                              .games.filter(
                                g =>
                                  g.host_type === HostType.CTFGame &&
                                  g.start_at < DateTime.now() &&
                                  g.end_at > DateTime.now()
                              )
                              .reduce((a, b) => a + b.teams, 0),
                            children: statistics()!
                              .games.filter(
                                g =>
                                  g.host_type === HostType.CTFGame &&
                                  g.start_at < DateTime.now() &&
                                  g.end_at > DateTime.now()
                              )
                              .map(g => ({
                                value: g.teams,
                                name: g.name,
                              })),
                          },
                          {
                            itemStyle: {
                              color: '#808080',
                            },
                            name: t('admin.statistics.endedGames'),
                            value: statistics()!
                              .games.filter(g => g.host_type === HostType.CTFGame && g.end_at < DateTime.now())
                              .reduce((a, b) => a + b.teams, 0),
                            children: statistics()!
                              .games.filter(g => g.host_type === HostType.CTFGame && g.end_at < DateTime.now())
                              .map(g => ({
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
                        r0: '20%',
                        r: '50%',
                      },
                      {
                        r0: '50%',
                        r: '70%',
                      },
                      {
                        r0: '70%',
                        r: '80%',
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
        </div>
        <Divider class="hidden xl:flex col-span-3" />
        <Card class="col-span-1 h-32 lg:h-48" contentClass="p-3 lg:p-6 flex flex-row items-center space-x-8">
          <div class="h-full aspect-square flex items-center justify-center">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: '16px',
                    right: '16px',
                    bottom: '16px',
                    top: '16px',
                  },
                  series: {
                    type: 'sunburst',
                    emphasis: {
                      focus: 'ancestor',
                    },
                    data: [
                      {
                        itemStyle: {
                          color: '#0991ed',
                        },
                        value: statistics()!.users.valid,
                      },
                      {
                        value: statistics()!.users.total - statistics()!.users.valid,
                        itemStyle: {
                          color: '#db640e',
                        },
                      },
                    ],
                    levels: [
                      {},
                      {
                        r0: '40%',
                        r: '80%',
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
          <div class="flex-1 flex flex-col space-y-2 lg:space-y-4">
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--emoji-sparkle-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl text-info">{statistics()?.users.valid}</span>
              <span class="opacity-60">{t('admin.statistics.validUsers')}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--person-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl">{statistics()?.users.total}</span>
              <span class="opacity-60">{t('admin.statistics.totalUsers')}</span>
            </div>
          </div>
        </Card>
        <Card class="col-span-1 h-32 lg:h-48" contentClass="p-3 lg:p-6 flex flex-row items-center space-x-8">
          <div class="h-full aspect-square flex items-center justify-center">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: '16px',
                    right: '16px',
                    bottom: '16px',
                    top: '16px',
                  },
                  toolbox: {},
                  series: {
                    type: 'sunburst',
                    emphasis: {
                      focus: 'ancestor',
                    },
                    data: [
                      {
                        itemStyle: {
                          color: '#db640e',
                        },
                        value: statistics()!.challenges.in_game,
                      },
                      {
                        value: statistics()!.challenges.total - statistics()!.challenges.in_game,
                        itemStyle: {
                          color: '#0991ed',
                        },
                      },
                      {
                        value: statistics()!.challenges.total === 0 ? 1 : 0,
                        itemStyle: {
                          color: '#808080',
                        },
                      },
                    ],
                    levels: [
                      {},
                      {
                        r0: '40%',
                        r: '80%',
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
          <div class="flex-1 flex flex-col space-y-2 lg:space-y-4">
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--code-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl text-warning">{statistics()?.challenges.in_game}</span>
              <span class="opacity-60">{t('admin.statistics.inGameChallenges')}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--target-edit-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl">{statistics()?.challenges.total}</span>
              <span class="opacity-60">{t('admin.statistics.totalChallenges')}</span>
            </div>
          </div>
        </Card>
        <Card class="col-span-1 h-32 lg:h-48" contentClass="p-3 lg:p-6 flex flex-row items-center space-x-8">
          <div class="h-full aspect-square flex items-center justify-center">
            <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
              <Chart
                option={{
                  grid: {
                    left: '16px',
                    right: '16px',
                    bottom: '16px',
                    top: '16px',
                  },
                  toolbox: {},
                  series: {
                    type: 'sunburst',
                    emphasis: {
                      focus: 'ancestor',
                    },
                    data: [
                      {
                        itemStyle: {
                          color: '#17a750',
                        },
                        value: statistics()!.submissions.solved,
                      },
                      {
                        value: statistics()!.submissions.total - statistics()!.submissions.solved,
                        itemStyle: {
                          color: '#db640e',
                        },
                      },
                      {
                        value: statistics()!.submissions.total === 0 ? 1 : 0,
                        itemStyle: {
                          color: '#808080',
                        },
                      },
                    ],
                    levels: [
                      {},
                      {
                        r0: '40%',
                        r: '80%',
                      },
                    ],
                  },
                }}
              />
            </Show>
          </div>
          <div class="flex-1 flex flex-col space-y-2 lg:space-y-4">
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--checkmark-starburst-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl text-success">{statistics()?.submissions.solved}</span>
              <span class="opacity-60">{t('admin.statistics.solvedSubmissions')}</span>
            </div>
            <div class="flex flex-row space-x-4 items-center flex-1">
              <span class="icon-[fluent--text-bullet-list-20-regular] w-8 h-8 opacity-80"></span>
              <span class="font-bold text-3xl">{statistics()?.submissions.total}</span>
              <span class="opacity-60">{t('admin.statistics.totalSubmissions')}</span>
            </div>
          </div>
        </Card>
        <Card
          class="col-span-1 xl:col-span-3 min-h-64 lg:min-h-80"
          contentClass="p-3 lg:p-6 flex flex-row items-center"
        >
          <Show when={statistics() && !loading()} fallback={<Spin width={24} height={24} />}>
            <Chart
              option={{
                grid: {
                  left: '32px',
                  right: '32px',
                  bottom: '32px',
                  top: '48px',
                },
                title: {
                  text: t('admin.statistics.instituteUsers'),
                  right: 'center',
                },
                toolbox: {},
                xAxis: {
                  type: 'category',
                  data: statistics()!.users.institutes.map(
                    i => statistics()!.institutes.find(ii => ii.id === i[0])!.name
                  ),
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                },
                series: {
                  type: 'bar',
                  data: statistics()!.users.institutes.map(i => i[1]),
                },
              }}
            />
          </Show>
        </Card>
      </div>
    </>
  )
}

import { JSX, Match, Show, Switch, createEffect, createSignal } from 'solid-js'
import { platformStore, setPlatformStore } from '@storage/platform'
import { t } from '@storage/theme'
import Link from '@widgets/link'
import LogoAnimate from '@assets/animates/logo-animate'
import Background from '@blocks/background'
import { useIsRouting, useLocation, useNavigate, useParams, useSearchParams } from '@solidjs/router'
import InstanceBox, { InstanceBoxContent } from './_blocks/instance-box'
import UserBox from './_blocks/user-box'
import DiyBox, { DiyBoxContent } from './_blocks/diy-box'
import { canAccessChallenges, gameStore, isGameAdmin } from '@storage/game'
import { HostType } from '@models/game'
import { accountStore } from '@storage/account'
import { Permission } from '@models/user'
import Popover from '@widgets/popover'
import Card from '@widgets/card'
import NotificationBox, { NotificationBoxContent } from './_blocks/notification-box'
import { getPlatformInfo, getVersion } from '@/lib/api/platform'
import { addToast, removeToast, toastStore } from '@/lib/storage/toast'
import Divider from '@/lib/widgets/divider'
import Toasts from './_blocks/toasts'
import { Transition } from 'solid-transition-group'
import Button from '@/lib/widgets/button'
import { wsrx } from '@/lib/wsrx'
import { Title, setupTitleResolver } from '@storage/header'
import { DateTime } from 'luxon'
import Spin from '@/lib/assets/animates/spin'
import { HTTPError } from '@reverier/ky'
import LoadingTips from '@/lib/widgets/loading-tips'
import { mediaPath } from '@/lib/utils/media'
import Timer from '@/lib/widgets/timer'
import Progress from '@/lib/widgets/progress'
import TimeProgress from '@/lib/widgets/time-progress'

function GlobalTitleLink(props: { loading: boolean }) {
  return (
    <>
      <Link ghost href="/">
        <Show when={!props.loading} fallback={<Spin width={24} height={24} />}>
          <LogoAnimate class="hidden xl:inline-block" width={24} height={24} />
        </Show>
        <span></span>
        <span>{platformStore.config.name || t('platform.name')}</span>
      </Link>
    </>
  )
}

function GameTitleLink(props: { loading: boolean }) {
  return (
    <>
      <Link ghost href={`/games/${gameStore.current?.id}/`}>
        <Show when={!props.loading} fallback={<Spin width={24} height={24} />}>
          <Show when={gameStore.current?.logo} fallback={<LogoAnimate width={24} height={24} />}>
            <img src={mediaPath(gameStore.current!.logo!)} width={24} height={24}></img>
          </Show>
        </Show>
        <span></span>
        <span>{gameStore.current?.name}</span>
      </Link>
    </>
  )
}

function GlobalNav(props: { size: 'sm' | 'md' }) {
  return (
    <>
      <li class="nav">
        <Link class="w-full" href="/wiki" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--book-number-20-regular] w-5 h-5" />
          <span>{t('wiki.title')}</span>
        </Link>
      </li>
      <li class="nav">
        <Link class="w-full" href="/training" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--dumbbell-20-regular] w-5 h-5" />
          <span>{t('training.title')}</span>
        </Link>
      </li>
      <li class="nav">
        <Link class="w-full" href="/games" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
          <span>{t('game.title')}</span>
        </Link>
      </li>
      <li class="nav">
        <Link class="w-full" href="/bulletin" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--megaphone-20-regular] w-5 h-5" />
          <span>{t('bulletin.title')}</span>
        </Link>
      </li>
      <Show
        when={
          accountStore.token &&
          accountStore.info &&
          (accountStore.info?.permissions.includes(Permission.Statistics) ||
            accountStore.info?.permissions.includes(Permission.DevOps) ||
            accountStore.info?.permissions.includes(Permission.User))
        }
      >
        <li class="nav">
          <Link class="w-full" href="/admin" activeMatch="partial" ghost justify="start" size={props.size}>
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t('admin.title')}</span>
          </Link>
        </li>
      </Show>
    </>
  )
}

function GameNav(props: { size: 'sm' | 'md' }) {
  return (
    <>
      <li class="nav">
        <Link
          class="w-full"
          href={`/games/${gameStore.current?.id}/challenges`}
          activeMatch="partial"
          ghost
          justify="start"
          size={props.size}
          disabled={!canAccessChallenges()}
        >
          <span class="icon-[fluent--code-20-regular] w-5 h-5" />
          <span>{t('game.challenge.title')}</span>
        </Link>
      </li>
      <li class="nav">
        <Link
          class="w-full"
          href={`/games/${gameStore.current?.id}/scoreboard`}
          activeMatch="partial"
          ghost
          justify="start"
          size={props.size}
        >
          <span class="icon-[fluent--trophy-20-regular] w-5 h-5" />
          <span>{t('game.scoreboard.title')}</span>
        </Link>
      </li>
      <Show when={gameStore.current?.end_at && gameStore.current.end_at < DateTime.now()}>
        <li class="nav">
          <Link
            class="w-full"
            href={`/games/${gameStore.current?.id}/writeups`}
            activeMatch="partial"
            ghost
            justify="start"
            size={props.size}
          >
            <span class="icon-[fluent--book-open-20-regular] w-5 h-5" />
            <span>{t('game.writeup.title')}</span>
          </Link>
        </li>
      </Show>
      <Show when={isGameAdmin()}>
        <li class="nav">
          <Link
            class="w-full"
            href={`/games/${gameStore.current?.id}/admin`}
            activeMatch="partial"
            ghost
            justify="start"
            size={props.size}
          >
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t('game.admin.title')}</span>
          </Link>
        </li>
      </Show>
      <li class="nav">
        <Link class="w-full" href={`/games/`} ghost justify="start" size={props.size} level="warning">
          <span class="icon-[fluent--arrow-exit-20-regular] w-5 h-5" />
          <span>{t('game.exit')}</span>
        </Link>
      </li>
    </>
  )
}

function TitleBar() {
  const [additionalMobileBox, setAdditionalMobileBox] = createSignal<'wsrx' | 'notification' | 'diy' | null>(null)
  const params = useParams()

  // TODO: it does not work at this point, see solidjs/solid-router#102
  const isRouting = useIsRouting()
  const [loading, setLoading] = createSignal(false)
  createEffect(() => {
    if (isRouting()) {
      // console.log('routing', isRouting())
      setTimeout(() => {
        // console.log('set routing', isRouting())
        if (isRouting()) {
          // console.log('set routing true')
          setLoading(true)
        }
      }, 500)
    } else {
      setLoading(false)
    }
  })

  return (
    <>
      <div id="page-top" class="print:hidden" />
      <div class="hidden print:flex flex-row border-b border-b-layer-content/60 w-full">
        <span>{platformStore.config.name || t('platform.name')}</span>
        <span class="flex-1"></span>
        <span>{DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')}</span>
      </div>
      <div class="h-16 border-b border-b-layer-content/15 w-screen bg-layer/60 backdrop-blur z-50 print:hidden print:static print:h-0 print:max-h-0 print:overflow-hidden sticky top-0 left-0 transition-colors duration-700">
        <div class="bg-layer-content/5 w-full h-full px-2 py-0 flex flex-row items-center relative">
          <div class="xl:hidden">
            <Popover
              btnContent={<span class="icon-[fluent--navigation-20-regular] w-5 h-5"></span>}
              square
              ghost
              popContentClass="pt-2"
            >
              <div class="flex flex-col space-y-2 w-48">
                <Card contentClass="p-2 flex flex-col space-y-2">
                  <ul class="flex flex-col space-y-2">
                    <Switch>
                      <Match when={platformStore.isOnline}>
                        <GlobalNav size="sm" />
                      </Match>
                      <Match
                        when={
                          platformStore.isOnline &&
                          gameStore.current &&
                          gameStore.current.host_type === HostType.CTFGame
                        }
                      >
                        <GameNav size="sm" />
                      </Match>
                    </Switch>
                    <Divider direction="horizontal" />
                    <Show when={platformStore.isOnline && accountStore.token !== null && gameStore.current}>
                      <Button
                        justify="start"
                        size="sm"
                        ghost={additionalMobileBox() !== 'wsrx'}
                        onClick={() => setAdditionalMobileBox('wsrx')}
                      >
                        <span
                          class={`${wsrx.instances().length > 0 ? 'icon-[fluent--fluid-20-filled]' : 'icon-[fluent--fluid-20-regular]'} w-5 h-5 ${wsrx.instances().length > 0 ? (wsrx.connected() ? 'text-success' : 'text-warning') : ''}`}
                        />
                        <span>{t('instance.box')}</span>
                      </Button>
                    </Show>
                    <li>
                      <Button
                        justify="start"
                        class="w-full"
                        size="sm"
                        ghost={additionalMobileBox() !== 'notification'}
                        onClick={() => setAdditionalMobileBox('notification')}
                      >
                        <span
                          class={`${toastStore.toasts.length > 0 ? 'icon-[fluent--alert-badge-20-filled] text-primary' : 'icon-[fluent--alert-20-regular]'} w-5 h-5`}
                        />
                        <span>{t('platform.notificationBox')}</span>
                      </Button>
                    </li>
                    <li>
                      <Button
                        justify="start"
                        class="w-full"
                        size="sm"
                        ghost={additionalMobileBox() !== 'diy'}
                        onClick={() => setAdditionalMobileBox('diy')}
                      >
                        <span class="icon-[fluent--wand-20-regular] w-5 h-5" />
                        <span>{t('platform.diyBox')}</span>
                      </Button>
                    </li>
                  </ul>
                </Card>
                <Switch fallback={null}>
                  <Match when={additionalMobileBox() === 'wsrx'}>
                    <InstanceBoxContent />
                  </Match>
                  <Match when={additionalMobileBox() === 'notification'}>
                    <NotificationBoxContent />
                  </Match>
                  <Match when={additionalMobileBox() === 'diy'}>
                    <DiyBoxContent />
                  </Match>
                </Switch>
              </div>
            </Popover>
          </div>
          <Switch fallback={<GlobalTitleLink loading={loading()} />}>
            <Match when={gameStore.current && gameStore.current.host_type === HostType.CTFGame && params.game}>
              <GameTitleLink loading={loading()} />
            </Match>
          </Switch>
          <div class="w-4"></div>
          <ul class="xl:flex flex-row space-x-2 items-center hidden">
            <Switch fallback={<LoadingTips class="opacity-60" />}>
              <Match
                when={
                  platformStore.isOnline &&
                  gameStore.current &&
                  gameStore.current.host_type === HostType.CTFGame &&
                  params.game
                }
              >
                <GameNav size="md" />
              </Match>
              <Match when={platformStore.isOnline}>
                <GlobalNav size="md" />
              </Match>
            </Switch>
          </ul>
          <div class="flex-1"></div>
          <div class="flex flex-row space-x-2">
            <div class="hidden lg:flex flex-row space-x-2">
              <Show when={platformStore.isOnline && accountStore.token !== null && gameStore.current}>
                <Show
                  when={
                    gameStore.current &&
                    gameStore.current.start_at < DateTime.now() &&
                    gameStore.current.end_at > DateTime.now()
                  }
                >
                  <div class="flex flex-col items-center justify-center px-4 relative">
                    <Timer end={gameStore.current!.end_at} />
                    <TimeProgress
                      class="w-full"
                      start_at={gameStore.current!.start_at}
                      end_at={gameStore.current!.end_at}
                    />
                  </div>
                </Show>
                <InstanceBox />
              </Show>
              <NotificationBox />
              <DiyBox />
            </div>
            <Switch
              fallback={
                <Button level="error">
                  <span class="icon-[fluent--dismiss-circle-20-filled] w-5 h-5"></span>
                  <span>{t('platform.unavailable')}</span>
                </Button>
              }
            >
              <Match when={platformStore.isOnline}>
                <UserBox />
              </Match>
              <Match when={platformStore.under_maintenance}>
                <Button level="warning">
                  <span class="icon-[fluent--warning-20-filled] w-5 h-5"></span>
                  <span>{t('platform.underMaintenance')}</span>
                </Button>
              </Match>
            </Switch>
          </div>
          <Show when={loading()}>
            <div class="absolute bottom-0 left-0 right-0 h-1 skeleton"></div>
          </Show>
        </div>
      </div>
    </>
  )
}

function checkCookiePolicy() {
  if (!platformStore.accept_cookies) {
    const toastId = addToast({
      level: 'info',
      description: t('platform.cookiePolicy') as string,
      accept: () => {
        setPlatformStore({ accept_cookies: true })
        setTimeout(() => {
          removeToast(toastId)
        }, 50)
      },
      acceptLabel: t('platform.ok'),
      reject: () => {
        setPlatformStore({ accept_cookies: true })
        setTimeout(() => {
          removeToast(toastId)
        }, 50)
      },
      rejectLabel: t('platform.yes'),
    })
  }
}

export default function (props: { children?: JSX.Element }) {
  let platformName = `\xa0\xa0[\xa0${platformStore.config.name || t('platform.name')}\xa0]\xa0`
  const [platformTyped, setPlatformTyped] = createSignal('')
  const [hideAnimation, setHideAnimation] = createSignal(false)
  const showAnimation = useLocation().pathname === '/' && useSearchParams()[0].event === undefined
  const navigate = useNavigate()
  checkCookiePolicy()
  setupTitleResolver()
  getPlatformInfo()
    .then(res => {
      setPlatformStore({ config: res, under_maintenance: false, backend_online: true })
    })
    .catch((err: HTTPError) => {
      if (err.response?.status === 503) {
        setPlatformStore({ under_maintenance: true })
        navigate('/')
      } else if (err.response?.status === 502) {
        addToast({
          level: 'error',
          description: `${t('platform.offline')}`,
        })
        navigate(`/errors/${err.response?.status || 502}`)
      } else {
        addToast({
          level: 'error',
          description: `${t('platform.error')}: ${err.response?.statusText || err.message}`,
        })
        navigate(`/errors/${err.response?.status || 500}`)
      }
      setPlatformStore({ backend_online: false })
    })
    .finally(() => {
      platformName = `\xa0\xa0[\xa0${platformStore.config.name || t('platform.name')}\xa0]\xa0`
      if (showAnimation) {
        setTimeout(() => {
          const typeTimer = setInterval(() => {
            if (platformTyped().length < platformName!.length) {
              setPlatformTyped(platformName!.slice(0, platformTyped().length + 1))
            } else {
              clearInterval(typeTimer)
              setTimeout(() => {
                setHideAnimation(true)
              }, 500)
            }
          }, 100)
        }, 1000)
      }
    })
  getVersion()
    .then(version => {
      setPlatformStore({ version })
      console.log(
        `\n%cR%cet %c2 %cS%chell %cv%c${version}\n\n%cCopyright (c) 2022 - 2024 %cRet 2 Shell%c, All rights reserved.\n`,
        'color: #0078D6; font-weight: bold; font-size: 1.5rem;',
        'color: currentColor; font-weight: bold; font-size: 1.5rem;',
        'color: #808080; font-weight: bold; font-size: 1.5rem;',
        'color: #f83030; font-weight: bold; font-size: 1.5rem;',
        'color: currentColor; font-weight: bold; font-size: 1.5rem;',
        'color: #0078D6',
        'color: #808080',
        'color: #808080',
        'color: #808080;text-decoration: underline;',
        'color: #808080;'
      )
      console.log(
        `\n%cHaving issue? You can open a ticket on https://github.com/ret2shell, any bug reports or feature requests are welcome.\n`,
        'color: currentColor;'
      )
      console.log(
        `\n%cIf you want to self-host CTF platforms or look for further cooperating, please contact ret2shell@woooo.tech.\n`,
        'color: currentColor;'
      )
    })
    .catch(() => {})
  return (
    <>
      <Title title={platformStore.config.name || t('platform.name')!} />
      <Background />
      <TitleBar />
      {props.children}
      <Toasts />
      <Transition
        onExit={(el, done) => {
          const a = el.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 300,
          })
          a.finished.then(done)
        }}
      >
        <Show when={showAnimation && !hideAnimation()}>
          <div class="fixed top-0 left-0 w-screen h-screen bg-layer z-50 print:hidden">
            <Background />
            <div class="w-full h-full flex flex-col items-center pt-16 pb-24">
              <div class="flex-1" />
              <h1 class="text-3xl font-bold z-50 opacity-80">
                {platformTyped()}
                <span class="text-primary animate-ping">_</span>
              </h1>
              <div class="text-xl opacity-0 mt-8">&nbsp;</div>
              <div class="flex-1" />
            </div>
          </div>
        </Show>
      </Transition>
    </>
  )
}

import { JSX, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { platformStore, setPlatformStore } from '@storage/platform'
import { t } from '@storage/theme'
import { Motion, Presence } from 'solid-motionone'
import Link from '@widgets/link'
import LogoAnimate from '@assets/animates/logo-animate'
import Background from '@blocks/background'
import { useLocation } from '@solidjs/router'
import InstanceBox from './_blocks/instance-box'
import UserBox from './_blocks/user-box'
import DiyBox from './_blocks/diy-box'
import { gameStore } from '@storage/game'
import { HostType } from '@models/game'
import { accountStore } from '@storage/account'
import { Permission } from '@models/user'
import Popover from '@widgets/popover'
import Card from '@widgets/card'
import NotificationBox from './_blocks/notification-box'
import { getPlatformInfo } from '@/lib/api/platform'
import { addToast } from '@/lib/storage/toast'
import Divider from '@/lib/widgets/divider'

function GlobalTitleLink() {
  return (
    <>
      <Link ghost href="/">
        <LogoAnimate class="hidden xl:inline-block" width={24} height={24} />
        <span></span>
        <span>{platformStore.config.name || t('platform.name')}</span>
      </Link>
    </>
  )
}

function GameTitleLink() {
  return (
    <>
      <Link ghost href={`/games/${gameStore.current?.id}/`}>
        <LogoAnimate class="hidden xl:inline-block" width={24} height={24} />
        <span></span>
        <span>{gameStore.current?.name}</span>
      </Link>
    </>
  )
}

function GlobalNav(props: { size: 'sm' | 'md' }) {
  return (
    <>
      <li>
        <Link class="w-full" href="/wiki" activeMatch="prefix" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--book-number-20-regular] w-5 h-5" />
          <span>{t('wiki.title')}</span>
        </Link>
      </li>
      <li>
        <Link class="w-full" href="/training" activeMatch="prefix" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--dumbbell-20-regular] w-5 h-5" />
          <span>{t('training.title')}</span>
        </Link>
      </li>
      <li>
        <Link class="w-full" href="/games" activeMatch="prefix" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
          <span>{t('game.title')}</span>
        </Link>
      </li>
      <li>
        <Link class="w-full" href="/bulletin" activeMatch="prefix" ghost justify="start" size={props.size}>
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
            accountStore.info?.permissions.includes(Permission.User) ||
            accountStore.info?.permissions.includes(Permission.Host))
        }
      >
        <li>
          <Link class="w-full" href="/admin" activeMatch="prefix" ghost justify="start" size={props.size}>
            <span class="icon-[fluent--organization-20-regular] w-5 h-5" />
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
      <li>
        <Link
          class="w-full"
          href={`/games/${gameStore.current?.id}/challenges`}
          activeMatch="prefix"
          ghost
          justify="start"
          size={props.size}
        >
          <span class="icon-[fluent--code-20-regular] w-5 h-5" />
          <span>{t('game.challenge.title')}</span>
        </Link>
      </li>
      <li>
        <Link
          class="w-full"
          href={`/games/${gameStore.current?.id}/scoreboard`}
          activeMatch="prefix"
          ghost
          justify="start"
          size={props.size}
        >
          <span class="icon-[fluent--trophy-20-regular] w-5 h-5" />
          <span>{t('game.scoreboard.title')}</span>
        </Link>
      </li>
      <Show when={(gameStore.current?.archive_at.diffNow().toMillis() || 0) < 0}>
        <li>
          <Link
            class="w-full"
            href={`/games/${gameStore.current?.id}/writeups`}
            activeMatch="prefix"
            ghost
            justify="start"
            size={props.size}
          >
            <span class="icon-[fluent--book-open-20-regular] w-5 h-5" />
            <span>{t('game.writeup.title')}</span>
          </Link>
        </li>
      </Show>
      <li>
        <Link
          class="w-full"
          href={`/games/${gameStore.current?.id}/admin`}
          activeMatch="prefix"
          ghost
          justify="start"
          size={props.size}
        >
          <span class="icon-[fluent--book-open-20-regular] w-5 h-5" />
          <span>{t('game.admin.title')}</span>
        </Link>
      </li>
      <li>
        <Link
          class="w-full"
          href={`/games/`}
          activeMatch="prefix"
          ghost
          justify="start"
          size={props.size}
          level="warning"
        >
          <span class="icon-[fluent--arrow-exit-20-regular] w-5 h-5" />
          <span>{t('game.exit')}</span>
        </Link>
      </li>
    </>
  )
}

function TitleBar() {
  return (
    <>
      <div id="page-top" />
      <div class="h-16 border-b border-b-layer-content/15 w-auto bg-layer/60 backdrop-blur z-50 print:hidden sticky top-0 left-0 transition-colors duration-700">
        <div class="bg-layer-content/5 w-full h-full px-2 py-0 flex flex-row items-center">
          <div class="xl:hidden">
            <Popover
              btnContent={<span class="icon-[fluent--navigation-20-regular] w-5 h-5"></span>}
              square
              ghost
              padding="pt-2"
            >
              <div class="flex flex-col space-y-2 w-48">
                <Card contentClass="p-2 flex flex-col space-y-2">
                  <ul class="flex flex-col space-y-2">
                    <Switch fallback={<GlobalNav size="sm" />}>
                      <Match when={gameStore.current && gameStore.current.host_type === HostType.CTFGame}>
                        <GameNav size="sm" />
                      </Match>
                    </Switch>
                  </ul>
                  <Divider direction="horizontal" />
                  <div class="flex flex-row space-x-2">
                    <Show when={accountStore.token !== null}>
                      <InstanceBox />
                    </Show>
                    <NotificationBox />
                    <DiyBox />
                  </div>
                </Card>
              </div>
            </Popover>
          </div>
          <Switch fallback={<GlobalTitleLink />}>
            <Match when={gameStore.current && gameStore.current.host_type === HostType.CTFGame}>
              <GameTitleLink />
            </Match>
          </Switch>
          <div class="w-4"></div>
          <ul class="xl:flex flex-row space-x-2 hidden">
            <Switch fallback={<GlobalNav size="md" />}>
              <Match when={gameStore.current && gameStore.current.host_type === HostType.CTFGame}>
                <GameNav size="md" />
              </Match>
            </Switch>
          </ul>
          <div class="flex-1"></div>
          <div class="flex flex-row space-x-2">
            <div class="hidden md:flex flex-row space-x-2">
              <Show when={accountStore.token !== null}>
                <InstanceBox />
              </Show>
              <NotificationBox />
              <DiyBox />
            </div>
            <UserBox />
          </div>
        </div>
      </div>
    </>
  )
}

export default function (props: { children?: JSX.Element }) {
  let platformName = `\xa0\xa0[\xa0${platformStore.config.name || t('platform.name')}\xa0]\xa0`
  const [platformTyped, setPlatformTyped] = createSignal('')
  const [hideAnimation, setHideAnimation] = createSignal(false)
  const showAnimation = useLocation().pathname === '/'
  getPlatformInfo()
    .then(res => {
      setPlatformStore({ ...platformStore, config: res })
    })
    .catch(() => {
      addToast({
        level: 'error',
        description: `${t('platform.offline')}`,
      })
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
  return (
    <>
      <TitleBar />
      {props.children}
      <Presence exitBeforeEnter>
        <Show when={showAnimation && !hideAnimation()}>
          <Motion.div
            class="fixed top-0 left-0 w-screen h-screen bg-layer z-50"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
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
          </Motion.div>
        </Show>
      </Presence>
    </>
  )
}

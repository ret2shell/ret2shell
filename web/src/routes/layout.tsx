import { JSX, Match, Show, Switch, createSignal, onMount } from 'solid-js'
import { platformStore } from '../lib/storage/platform'
import { t } from '../lib/storage/theme'
import { Motion, Presence } from 'solid-motionone'
import Link from '../lib/widgets/link'
import LogoAnimate from '../lib/assets/animates/logo-animate'
import Background from '../lib/blocks/background'
import { useLocation } from '@solidjs/router'
import InstanceBox from './instance-box'
import UserBox from './user-box'
import DiyBox from './diy-box'
import { gameStore } from '../lib/storage/game'
import { HostType } from '../lib/models/game'
import { accountStore } from '../lib/storage/account'
import { Permission } from '../lib/models/user'

function GlobalTitleLink() {
  return (
    <Link ghost href="/">
      <LogoAnimate width={24} height={24} />
      <span></span>
      <span>{platformStore.name || t('platform.name')}</span>
    </Link>
  )
}

function GlobalNav() {
  return (
    <>
      <li>
        <Link href="/wiki" activeMatch="prefix" ghost justify="start">
          <span class="icon-[fluent--book-number-20-regular] w-5 h-5" />
          <span>{t('wiki.title')}</span>
        </Link>
      </li>
      <li>
        <Link href="/training" activeMatch="prefix" ghost justify="start">
          <span class="icon-[fluent--dumbbell-20-regular] w-5 h-5" />
          <span>{t('training.title')}</span>
        </Link>
      </li>
      <li>
        <Link href="/games" activeMatch="prefix" ghost justify="start">
          <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
          <span>{t('game.title')}</span>
        </Link>
      </li>
      <li>
        <Link href="/bulletin" activeMatch="prefix" ghost justify="start">
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
          <Link href="/admin" activeMatch="prefix" ghost justify="start">
            <span class="icon-[fluent--organization-20-regular] w-5 h-5" />
            <span>{t('admin.title')}</span>
          </Link>
        </li>
      </Show>
    </>
  )
}

function GameNav() {
  return (
    <>
      <li>
        <Link href={`/games/${gameStore.current?.id}/challenges`} activeMatch="prefix" ghost justify="start">
          <span class="icon-[fluent--code-20-regular] w-5 h-5" />
          <span>{t('game.challenge.title')}</span>
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
        <div class="bg-layer-content/5 w-full h-full px-2 py-0 flex flex-row items-center space-x-2">
          <GlobalTitleLink />
          <div class="w-4"></div>
          <ul class="flex flex-row space-x-2">
            <Switch fallback={<GlobalNav />}>
              <Match when={gameStore.current && gameStore.current.host_type === HostType.CTFGame}>
                <GameNav />
              </Match>
            </Switch>
          </ul>
          <div class="flex-1"></div>
          <InstanceBox />
          <DiyBox />
          <UserBox />
        </div>
      </div>
    </>
  )
}

export default function (props: { children?: JSX.Element }) {
  const platformName = `\xa0\xa0[\xa0${platformStore.name || t('platform.name')}\xa0]\xa0`
  let [platformTyped, setPlatformTyped] = createSignal('')
  let [hideAnimation, setHideAnimation] = createSignal(false)
  let showAnimation = useLocation().pathname === '/'

  onMount(() => {
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
      <Show when={showAnimation}>
        <Presence exitBeforeEnter>
          <Show when={!hideAnimation()}>
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
                <h1 class="text-3xl font-bold z-50">
                  {platformTyped()}
                  <span class="text-primary animate-ping">_</span>
                </h1>
                <div class="text-xl opacity-0 mt-8">&nbsp;</div>
                <div class="flex-1" />
              </div>
            </Motion.div>
          </Show>
        </Presence>
      </Show>
    </>
  )
}

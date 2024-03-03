import { JSX, Show, createSignal, onMount } from 'solid-js'
import { platformStore } from '../lib/storage/platform'
import { setLocale, t } from '../lib/storage/theme'
import { Motion, Presence } from 'solid-motionone'
import Link from '../lib/widgets/link'
import LogoAnimate from '../lib/assets/animates/logo-animate'
import Popover from '../lib/widgets/popover'
import Card from '../lib/widgets/card'
import Button from '../lib/widgets/button'
import DarkmodeButton from '../lib/blocks/darkmode-button'
import Background from '../lib/blocks/background'
import { useLocation } from '@solidjs/router'

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
        <Link href="/game" activeMatch="prefix" ghost justify="start">
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
      <li>
        <Link href="/admin" activeMatch="prefix" ghost justify="start">
          <span class="icon-[fluent--organization-20-regular] w-5 h-5" />
          <span>{t('admin.title')}</span>
        </Link>
      </li>
    </>
  )
}

function DiyBox() {
  return (
    <>
      <Popover btnContent={<span class="icon-[fluent--wand-20-regular] w-5 h-5" />} square ghost padding="pt-4">
        <div class="flex flex-col space-y-2">
          <Card class="p-2 flex flex-row space-x-2">
            <DarkmodeButton />
          </Card>
          <Card class="p-2 flex flex-col space-y-2">
            <ul class="flex flex-row">
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('zh_cn')} square ghost justify="center">
                  <span>简</span>
                </Button>
              </li>
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('zh_tw')} square ghost justify="center">
                  <span>繁</span>
                </Button>
              </li>
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('en_us')} square ghost justify="center">
                  <span>En</span>
                </Button>
              </li>
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('ja_jp')} square ghost justify="center">
                  <span>な</span>
                </Button>
              </li>
            </ul>
          </Card>
        </div>
      </Popover>
    </>
  )
}

function TitleBar() {
  return (
    <>
      <div id="page-top" />
      <div class="h-16 border-b border-b-layer-content/10 w-auto bg-layer/60 backdrop-blur z-50 print:hidden sticky top-0 left-0">
        <div class="bg-layer-content/5 w-full h-full px-2 py-0 flex flex-row items-center space-x-2">
          <GlobalTitleLink />
          <div class="w-4"></div>
          <ul class="flex flex-row space-x-2">
            <GlobalNav />
          </ul>
          <div class="flex-1"></div>
          <DiyBox />
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

import { JSX } from 'solid-js'
import { platformStore } from '../lib/storage/platform'
import { t } from '../lib/storage/theme'
import Link from '../lib/widgets/link'
import LogoAnimate from '../lib/assets/animates/logo-animate'

function GlobalTitleLink() {
  return (
    <Link ghost href="/">
      <LogoAnimate width={24} height={24} />
      <span>{platformStore.name || t('platform.name')}</span>
    </Link>
  )
}

function GlobalNav() {
  return (
    <>
      <ul>
        <li>
          <Link href="/wiki">{t('wiki.title')}</Link>
        </li>
      </ul>
    </>
  )
}

function TitleBar() {
  return (
    <>
      <div id="page-top" />
      <div class="h-16 border-b border-b-layer-content/10 w-auto backdrop-blur z-50 print:hidden sticky top-0 left-0">
        <div class="bg-layer-content/5 w-full h-full px-2 py-0 flex flex-row items-center">
          <GlobalTitleLink />
        </div>
      </div>
    </>
  )
}

export default function (props: { children?: JSX.Element }) {
  return (
    <>
      <TitleBar />
      {props.children}
    </>
  )
}

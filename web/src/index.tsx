/* @refresh reload */
import { render } from 'solid-js/web'
import { routes } from './routes/routes'
import '@fontsource/jetbrains-mono'
import 'overlayscrollbars/overlayscrollbars.css'
import './lib/widgets/styles/base.scss'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'
import { initTheme, t, themeStore } from './lib/storage/theme'
import { Title, MetaProvider } from '@solidjs/meta'
import { platformStore } from './lib/storage/platform'
import { Router } from '@solidjs/router'
import { onMount } from 'solid-js'
import Background from './lib/blocks/background'

function checkEdition() {
  const compact_edition = process.env.FARM_COMPAT_EDITION
  const edition = localStorage.getItem('edition')
  const needReload = localStorage.length !== 0 && edition !== compact_edition
  if (compact_edition && needReload) {
    alert(
      '回归终端进行了一项非兼容更新，我们将重新加载此页面以应用更新。请注意您可能需要重新登录。\n\n' +
        'Ret2Shell 進行了一項非相容更新，我們將重新載入此頁面以套用更新。 請注意您可能需要重新登入。\n\n' +
        'Ret2Shell がメジャーアップデートを行いました。これを適用するためにこのページを再読み込みします。再ログインが必要な場合があります。\n\n' +
        'Ret2Shell has done a major update, we will reload this page to apply it. Please note that you may need re-login.\n\n'
    )
    localStorage.clear()
    localStorage.setItem('edition', compact_edition)
    location.reload()
  } else if (compact_edition) {
    localStorage.setItem('edition', compact_edition)
  }
}

render(() => {
  checkEdition()
  initTheme()
  onMount(() => {
    setTimeout(() => {
      document.documentElement.classList.add('transition-colors', 'duration-700')
      document.body.classList.add('transition-colors', 'duration-700')
    }, 1000)
  })
  return (
    <>
      <MetaProvider>
        <Title>{platformStore.name || t('platform.name')}</Title>
        <Background />
        <OverlayScrollbarsComponent
          options={{
            scrollbars: {
              theme: themeStore.colorScheme === 'light' ? 'os-theme-dark' : 'os-theme-light',
              autoHide: 'scroll',
            },
          }}
          class="relative w-screen h-screen print:h-auto print:overflow-auto"
          defer
        >
          <div class="flex flex-col min-h-full">
            <Router>{routes}</Router>
          </div>
        </OverlayScrollbarsComponent>
      </MetaProvider>
    </>
  )
}, document.getElementById('root')!)

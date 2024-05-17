/* @refresh reload */
import { render } from 'solid-js/web'
import { routes } from './routes/routes'
import '@fontsource/jetbrains-mono'
import 'overlayscrollbars/overlayscrollbars.css'
import '@widgets/styles/base.scss'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'
import { fullTheme, initTheme } from './lib/storage/theme'
import { Router } from '@solidjs/router'
import { onMount } from 'solid-js'

function checkEdition() {
  const compact_edition = import.meta.env.VITE_COMPAT_EDITION
  const edition = localStorage.getItem('edition')
  const needReload = localStorage.length !== 0 && edition !== compact_edition
  if (compact_edition && needReload) {
    const systemPrefersLocale = (window.navigator.language || window.navigator.languages[0])
      .replace('-', '_')
      .toLowerCase()
    switch (systemPrefersLocale) {
      case 'zh_cn':
        alert('回归终端进行了一项非兼容更新，将重新加载此页面以应用更新。请注意您可能需要重新登录。')
        break
      case 'zh_tw':
        alert('回歸終端進行了一項非相容更新，將重新載入此頁面以套用更新。請注意您可能需要重新登入。')
        break
      case 'ja_jp':
        alert(
          'Ret2Shell がメジャーアップデートを行いました、これを適用するためにこのページを再読み込みします。再ログインが必要な場合があります。'
        )
        break
      case 'en_us':
        alert(
          'Ret2Shell has done a major update, we will reload this page to apply it. Please note that you may need re-login.'
        )
        break
    }
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
      <OverlayScrollbarsComponent
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: 'scroll',
          },
        }}
        class="relative w-screen h-screen print:h-auto print:overflow-auto"
        defer
      >
        <div class="flex flex-col min-h-full min-w-fit">
          <Router>{routes}</Router>
        </div>
      </OverlayScrollbarsComponent>
    </>
  )
}, document.getElementById('root')!)

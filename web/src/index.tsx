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

render(() => {
  initTheme()
  return (
    <>
      <MetaProvider>
        <Title>{platformStore.name || t('platform.name')}</Title>
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
          <Router>{routes}</Router>
        </OverlayScrollbarsComponent>
      </MetaProvider>
    </>
  )
}, document.getElementById('root')!)

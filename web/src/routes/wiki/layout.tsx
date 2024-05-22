import SidebarLayout from '@/lib/blocks/sidebar-layout'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import { createBreakpoints } from '@solid-primitives/media'
import { JSX, Show, createSignal } from 'solid-js'
import { Transition } from 'solid-transition-group'
import SideBar from './_blocks/sidebar'
import { refreshWikiToc } from '@/lib/storage/wiki'

export default function (props: { children?: JSX.Element }) {
  const breakpoints = {
    lg: '1024px',
  }
  const matches = createBreakpoints(breakpoints)
  const [showSidebar, setShowSidebar] = createSignal(false)
  refreshWikiToc()
  return (
    <>
      <Title title={`${t('wiki.title')} - ${platformStore.config.name || t('platform.name')}`} />
      <SidebarLayout leftBar={<SideBar />} showLeftBar={showSidebar()}>
        {props.children}
      </SidebarLayout>
      <Transition name="slide-fade-right">
        <Show when={!matches.lg}>
          <Button class="fixed bottom-3 right-3" square onClick={() => setShowSidebar(!showSidebar())} type="button">
            {/* icon-[fluent--navigation-20-regular] icon-[fluent--dismiss-20-regular] rotate-90 rotate-0 */}
            <span
              class={`transition-transform rotate-${showSidebar() ? '90' : '0'} icon-[fluent--${showSidebar() ? 'dismiss' : 'navigation'}-20-regular] w-5 h-5`}
            ></span>
          </Button>
        </Show>
      </Transition>
    </>
  )
}

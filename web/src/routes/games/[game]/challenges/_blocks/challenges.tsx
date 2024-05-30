import { gameStore } from '@/lib/storage/game'
import { fullTheme, t } from '@/lib/storage/theme'
import Link from '@/lib/widgets/link'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'

export default function () {
  return (
    <>
      <div class="border-b border-b-layer-content/10 p-3 lg:p-6">
        <Link class="w-full" ghost justify="start" href={`/games/${gameStore.current?.id}/challenges`}>
          <span class="icon-[fluent--flag-20-filled] w-5 h-5 text-primary"></span>
          <span>{t('game.challenge.list')}</span>
        </Link>
      </div>
      <div class="flex-1 overflow-hidden">
        <OverlayScrollbarsComponent
          options={{
            scrollbars: {
              theme: `os-theme-${fullTheme()}`,
              autoHide: 'scroll',
            },
          }}
          class="relative w-full h-full print:h-auto print:overflow-auto"
          defer
        >
          <div class="flex flex-col space-y-2 p-3 lg:p-6"></div>
        </OverlayScrollbarsComponent>
      </div>
    </>
  )
}

import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { gameStore } from '@/lib/storage/game'
import { fullTheme, t } from '@/lib/storage/theme'
import Divider from '@/lib/widgets/divider'
import Link from '@/lib/widgets/link'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'
import { Show } from 'solid-js'

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
          <div class="flex flex-col space-y-2 p-3 lg:p-6">
            <Show when={accountStore.permissions.includes(Permission.Game)}>
              <Link
                level="primary"
                title={t('form.create')}
                href={`/games/${gameStore.current?.id}/challenges?create=true`}
              >
                <span class="icon-[fluent--add-20-regular] w-5 h-5"></span>
                <span>{t('form.create')}</span>
              </Link>
              <Divider class="!mt-3 lg:!mt-6" />
            </Show>
          </div>
        </OverlayScrollbarsComponent>
      </div>
    </>
  )
}

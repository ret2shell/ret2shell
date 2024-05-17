import { Game } from '@/lib/models/game'
import { fullTheme, t } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import Divider from '@/lib/widgets/divider'
import Link from '@/lib/widgets/link'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'
import { For, createSignal } from 'solid-js'

export default function Playgrounds() {
  const [playgrounds, setPlaygrounds] = createSignal([] as Game[])
  const [playgroundPage, setPlaygroundPage] = createSignal(1)
  const pageSize = 12
  const [playgroundTotal, setPlaygroundTotal] = createSignal(1)
  const [games, setGames] = createSignal([] as Game[])
  const [gamePage, setGamePage] = createSignal(1)
  const [gameTotal, setGameTotal] = createSignal(1)
  return (
    <>
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
            <div class="flex flex-row space-x-2">
              <Button ghost disabled justify="start" class="flex-1" size="sm">
                <span>{t('training.title')}</span>
              </Button>
              <Button square ghost size="sm">
                <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5"></span>
              </Button>
              <Button ghost size="sm" class="min-w-8">
                <span>{playgroundPage()}</span>
              </Button>
              <Button square ghost size="sm">
                <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5"></span>
              </Button>
            </div>
            <For
              each={playgrounds()}
              fallback={
                <>
                  <Button ghost disabled>
                    <span class="icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5"></span>
                    <span>{t('training.noPlaygrounds')}</span>
                  </Button>
                </>
              }
            >
              {item => (
                <>
                  <Link ghost href={`/training/${item.id}`} activeMatch="partial" justify="start">
                    <span class="icon-[fluent--dumbbell-20-regular] w-5 h-5"></span>
                    <span class="flex-1 text-start">{item.name}</span>
                    <div class="w-2 h-2 rounded-full bg-success"></div>
                  </Link>
                </>
              )}
            </For>
            <Divider class="!mt-6" />
            <div class="flex flex-row space-x-2">
              <Button ghost disabled justify="start" size="sm" class="flex-1">
                <span>{t('game.title')}</span>
              </Button>
              <Button square ghost size="sm">
                <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5"></span>
              </Button>
              <Button ghost size="sm" class="min-w-8">
                <span>{gamePage()}</span>
              </Button>
              <Button square ghost size="sm">
                <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5"></span>
              </Button>
            </div>
            <For
              each={games()}
              fallback={
                <>
                  <Button ghost disabled>
                    <span class="icon-[fluent--text-bullet-list-dismiss-20-regular] w-5 h-5"></span>
                    <span>{t('training.noArchivedGames')}</span>
                  </Button>
                </>
              }
            >
              {item => (
                <>
                  <Link ghost href={`/training/${item.id}`} activeMatch="partial" justify="start">
                    <span class="icon-[fluent--flag-20-regular] w-5 h-5"></span>
                    <span class="flex-1 text-start">{item.name}</span>
                    <div class="w-2 h-2 rounded-full bg-warning"></div>
                  </Link>
                </>
              )}
            </For>
          </div>
        </OverlayScrollbarsComponent>
      </div>
    </>
  )
}

import { gameStore } from '@/lib/storage/game'
import { t, themeStore } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import Card from '@/lib/widgets/card'
import Divider from '@/lib/widgets/divider'
import Link from '@/lib/widgets/link'
import { useSearchParams } from '@solidjs/router'
import { For, Show } from 'solid-js'
import bluredBgDark from '@assets/imgs/bg-blur-stars.webp'
import bluredBgLight from '@assets/imgs/bg-blur-suzume.webp'
import LogoAnimate from '@/lib/assets/animates/logo-animate'
import Tag from '@/lib/widgets/tag'
import { DateTime } from 'luxon'

export default function () {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedGameId = () => {
    const result = searchParams.selected ? parseInt(searchParams.selected) : NaN
    if (isNaN(result)) {
      return null
    }
    return result
  }
  if (selectedGameId() === null && gameStore.games.length > 0) {
    setSearchParams({ selected: gameStore.games[0].id })
  }
  const selectedGame = () => {
    return gameStore.games.find(game => game.id === selectedGameId())
  }
  return (
    <>
      <div class="flex-1 relative">
        <div class="absolute h-full w-full overflow-scroll snap-mandatory snap-y">
          <section class="h-full min-h-full snap-center flex relative">
            <div class="w-1/4 hidden lg:flex flex-col items-end justify-start py-32 space-y-2">
              <Divider class="w-4/5" />
              <Button ghost class="w-4/5">
                <span class="icon-[fluent--chevron-double-up-20-regular] w-5 h-5 opacity-60"></span>
              </Button>
              <Divider class="w-4/5" />
              <For
                each={gameStore.games}
                fallback={
                  <Button ghost disabled class="w-4/5" justify="start">
                    <span class="icon-[fluent--flag-20-regular] w-5 h-5"></span>
                    <span>{t('game.noGameHosted')}</span>
                  </Button>
                }
              >
                {game => (
                  <>
                    <Link
                      ghost
                      class={`w-4/5 ${selectedGameId() === game.id ? 'btn-active' : ''}`}
                      justify="start"
                      href={`/games?selected=${game.id}`}
                    >
                      {/* icon-[fluent--flag-20-regular] icon-[fluent--flag-20-filled] */}
                      <span
                        class={`icon-[fluent--flag-20-${selectedGameId() === game.id ? 'filled' : 'regular'}] w-5 h-5 ${
                          selectedGameId() === game.id ? 'text-primary' : 'opacity-60'
                        }`}
                      ></span>
                      <span
                        class={`flex-1 text-start ${selectedGameId() === game.id ? 'font-bold' : 'font-normal opacity-60'}`}
                      >
                        {game.name}
                      </span>
                      <div
                        class={`w-2 h-2 rounded-full ${DateTime.now() < game.start_at ? 'bg-info' : DateTime.now() > game.end_at ? 'bg-warning' : 'bg-success'}`}
                      ></div>
                    </Link>
                  </>
                )}
              </For>
              <Divider class="w-4/5" />
              <Button ghost class="w-4/5">
                <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5 opacity-60"></span>
              </Button>
              <Divider class="w-4/5" />
            </div>
            <div class="w-16 hidden lg:inline-block"></div>
            <div class="flex-1 p-3 lg:p-12 flex flex-col items-center lg:justify-center lg:items-start">
              <Card
                class="aspect-video w-full lg:w-4/5 transform transition-all rounded-b-none lg:rounded-b-lg border-b-0 lg:border-b-[1px] overflow-hidden"
                contentClass="relative"
              >
                <Show
                  when={selectedGameId()}
                  fallback={
                    <>
                      <Show
                        when={themeStore.colorScheme === 'dark'}
                        fallback={<img src={bluredBgLight} class="w-full h-full" />}
                      >
                        <img src={bluredBgDark} class="w-full h-full" />
                      </Show>
                      <div class="w-full h-full absolute top-0 left-0 bg-layer/70 backdrop-blur flex items-center justify-center">
                        <LogoAnimate height="h-1/3" class="grayscale" />
                      </div>
                    </>
                  }
                >
                  <img src={selectedGame()?.cover || undefined}></img>
                </Show>
              </Card>
              <Card
                class="w-full lg:w-3/5 relative transform transition-all lg:-translate-y-[2rem] lg:translate-x-1/2 rounded-t-none lg:rounded-t-lg border-t-0 lg:border-t-[1px] flex"
                contentClass="flex-1 flex flex-col md:flex-row space-y-4 lg:space-y-0 lg:space-x-8 p-6 px-9 items-center"
              >
                <Show
                  when={selectedGame()?.logo}
                  fallback={<LogoAnimate class="hidden lg:block" width={64} height={64} />}
                >
                  <img class="hidden lg:block" src={selectedGame()?.logo || undefined} width={64} height={64}></img>
                </Show>
                <div class="flex flex-col space-y-2 flex-1 w-full lg:w-auto">
                  <h2 class="text-xl font-bold flex flex-row space-x-4">{selectedGame()?.name}</h2>
                  <p class="opacity-60">{selectedGame()?.brief}</p>
                </div>
                <div class="flex flex-col space-y-2">
                  <Tag level="success">
                    <span>{selectedGame()?.start_at.toFormat('yyyy-MM-dd HH:mm:ss')}</span>
                  </Tag>
                  <Tag level="warning">
                    <span>{selectedGame()?.end_at.toFormat('yyyy-MM-dd HH:mm:ss')}</span>
                  </Tag>
                </div>
                <a class="absolute w-full h-full top-0 left-0" href={`/games/${selectedGame()?.id}`}></a>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

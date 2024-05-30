import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { fullTheme, t } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import { Challenge } from '@models/challenge'
import Splitter from '@widgets/splitter'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-solid'
import { Show, createSignal } from 'solid-js'
import Terminal from './terminal'
import Hints from './hints'
import Files from './files'
import Hammer from './hammer'
import Answer from './answer'
import Statistics from './statistics'
import Instances from './instances'
import Settings from './settings'
import { Dynamic } from 'solid-js/web'
import { GameStoreType } from '@/lib/storage/game'
import { TrainingStoreType } from '@/lib/storage/training'

function BottomPanel(props: {
  challenge?: Challenge
  onStateChange?: (challenge: Challenge) => void
  inGame: boolean
  store: GameStoreType | TrainingStoreType
}) {
  const [page, setPage] = createSignal(0)
  const pages = [Terminal, Hints, Files, Hammer, Answer, Statistics, Instances, Settings]
  return (
    <>
      <div class="w-full h-full overflow-hidden flex flex-col">
        <OverlayScrollbarsComponent
          class="w-full h-16 backdrop-blur border-b border-b-layer-content/10 relative"
          options={{
            scrollbars: {
              theme: `os-theme-${fullTheme()}`,
              autoHide: 'scroll',
            },
          }}
          defer
        >
          <div class="h-full flex px-2 py-0 items-center space-x-2 min-w-max w-max">
            <Button onClick={() => setPage(0)} ghost={page() !== 0}>
              <span class="icon-[fluent--code-20-regular] w-5 h-5"></span>
              <span>{t('game.challenge.terminal')}</span>
            </Button>
            <Button onClick={() => setPage(1)} ghost={page() !== 1}>
              <span class="icon-[fluent--info-20-regular] w-5 h-5"></span>
              <span>{t('game.challenge.hint')}</span>
            </Button>
            <Button onClick={() => setPage(2)} ghost={page() !== 2}>
              <span class="icon-[fluent--save-20-regular] w-5 h-5"></span>
              <span>{t('game.challenge.files')}</span>
            </Button>
            <Button onClick={() => setPage(3)} ghost={page() !== 3} disabled={!props.inGame}>
              <span class="icon-[fluent-emoji-flat--hammer] w-5 h-5"></span>
              <span>{t('game.challenge.hammer')}</span>
            </Button>
            <Button
              onClick={() => setPage(4)}
              ghost={page() !== 4}
              disabled={
                props.inGame &&
                !(
                  !!accountStore.id &&
                  accountStore.permissions.includes(Permission.Game) &&
                  props.store.current?.admins.includes(accountStore.id)
                )
              }
            >
              <span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5"></span>
              <span>{t('game.challenge.answer')}</span>
            </Button>
            <Show
              when={
                !!accountStore.id &&
                accountStore.permissions.includes(Permission.Game) &&
                props.store.current?.admins.includes(accountStore.id)
              }
            >
              <Button onClick={() => setPage(5)} ghost={page() !== 5}>
                <span class="icon-[fluent--data-pie-20-regular] w-5 h-5"></span>
                <span>{t('game.challenge.statistics')}</span>
              </Button>
              <Button onClick={() => setPage(6)} ghost={page() !== 6}>
                <span class="icon-[fluent--production-20-regular] w-5 h-5"></span>
                <span>{t('game.challenge.instances')}</span>
              </Button>
              <Button onClick={() => setPage(7)} ghost={page() !== 7}>
                <span class="icon-[fluent--settings-20-regular] w-5 h-5"></span>
                <span>{t('game.challenge.settings')}</span>
              </Button>
            </Show>
          </div>
        </OverlayScrollbarsComponent>
        <OverlayScrollbarsComponent
          options={{
            scrollbars: {
              theme: `os-theme-${fullTheme()}`,
              autoHide: 'scroll',
            },
          }}
          class="relative w-full flex-1 print:h-auto print:overflow-auto"
          defer
        >
          <Dynamic component={pages[page()]} />
        </OverlayScrollbarsComponent>
      </div>
    </>
  )
}

export default function (props: {
  challenge?: Challenge
  onStateChange?: (challenge: Challenge) => void
  inGame: boolean
  store: GameStoreType | TrainingStoreType
}) {
  return (
    <div class="flex-1">
      <Splitter
        startPanel={<div></div>}
        endPanel={
          <BottomPanel
            store={props.store}
            inGame={props.inGame}
            challenge={props.challenge}
            onStateChange={props.onStateChange}
          />
        }
        orientation="vertical"
        size={[
          { id: 'a', size: 64, minSize: 24 },
          { id: 'b', size: 36, minSize: 20 },
        ]}
      ></Splitter>
    </div>
  )
}

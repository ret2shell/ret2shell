import { gameStore } from '@/lib/storage/game'
import { t } from '@/lib/storage/theme'
import Link from '@/lib/widgets/link'
import { Show } from 'solid-js'
import Challenges from './challenges'
import Playgrounds from './playgrounds'
import { accountStore } from '@/lib/storage/account'
import { Permission } from '@/lib/models/user'

export default function SideBar() {
  return (
    <div class="flex flex-col overflow-hidden w-full h-full">
      <div class="border-b border-b-layer-content/10 p-3 lg:p-6">
        <Show
          when={gameStore.current}
          fallback={
            <Link class="w-full" ghost justify="start" href="/training">
              <span class="icon-[fluent--dumbbell-20-filled] w-5 h-5 text-primary"></span>
              <span>{t('training.list')}</span>
            </Link>
          }
        >
          <Link class="w-full" ghost justify="start" href={`/training/${gameStore.current?.id}`}>
            <span class="icon-[fluent--dumbbell-20-filled] w-5 h-5 text-primary"></span>
            <span>{gameStore.current?.name}</span>
          </Link>
        </Show>
      </div>
      <Show when={gameStore.current} fallback={<Playgrounds />}>
        <Challenges />
      </Show>
    </div>
  )
}

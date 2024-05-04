import { gameStore } from '@/lib/storage/game'
import { t } from '@/lib/storage/theme'
import Link from '@/lib/widgets/link'

export default function () {
  return (
    <>
      <div class="border-b border-b-layer-content/10 p-3 lg:p-6">
        <Link class="w-full" ghost justify="start" href={`/games/${gameStore.current?.id}/challenges`}>
          <span class="icon-[fluent--flag-20-filled] w-5 h-5 text-primary"></span>
          <span>{t('game.challenge.list')}</span>
        </Link>
      </div>
    </>
  )
}

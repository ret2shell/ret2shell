import { gameStore } from '@/lib/storage/game'
import { t } from '@/lib/storage/theme'
import Link from '@/lib/widgets/link'

export default function () {
  return (
    <>
      <div class="border-b border-b-layer-content/10 p-3 lg:p-6">
        <div class="flex flex-row space-x-2">
          <Link class="flex-1" ghost justify="start" href={`/games/${gameStore.current?.id}/challenges`}>
            <span class="icon-[fluent--flag-20-filled] w-5 h-5 text-primary"></span>
            <span>{t('game.challenge.list')}</span>
          </Link>
          <Link
            level="primary"
            square
            href={`/games/${gameStore.current?.id}/challenges?create=true`}
            title={t('form.create')}
          >
            <span class="icon-[fluent--add-20-regular] w-5 h-5"></span>
          </Link>
        </div>
      </div>
    </>
  )
}

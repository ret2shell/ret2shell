import { gameStore } from '@/lib/storage/game'
import { t } from '@/lib/storage/theme'
import Link from '@/lib/widgets/link'

export default function SideBar() {
  return (
    <>
      <ul class="flex flex-col space-y-2 p-3 lg:p-6">
        <li class="w-full">
          <Link class="w-full" ghost href={`/games/${gameStore.current?.id}/admin/statistics`} justify="start">
            <span class="icon-[fluent--data-trending-20-regular] w-5 h-5"></span>
            <span>{t('game.admin.statistics.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link class="w-full" ghost href={`/games/${gameStore.current?.id}/admin/teams`} justify="start">
            <span class="icon-[fluent--flash-flow-20-regular] w-5 h-5"></span>
            <span>{t('game.admin.events.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link class="w-full" ghost href={`/games/${gameStore.current?.id}/admin/teams`} justify="start">
            <span class="icon-[fluent--people-team-20-regular] w-5 h-5"></span>
            <span>{t('game.admin.teams.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link class="w-full" ghost href={`/games/${gameStore.current?.id}/admin/automate`} justify="start">
            <span class="icon-[fluent--cloud-flow-20-regular] w-5 h-5"></span>
            <span>{t('game.admin.automate.title')}</span>
          </Link>
        </li>
        <li class="w-full">
          <Link class="w-full" ghost href={`/games/${gameStore.current?.id}/admin/edit`} justify="start">
            <span class="icon-[fluent--edit-20-regular] w-5 h-5"></span>
            <span>{t('game.admin.edit.title')}</span>
          </Link>
        </li>
      </ul>
    </>
  )
}

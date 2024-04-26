import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { gameStore } from '@/lib/storage/game'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import { useNavigate } from '@solidjs/router'
import { DateTime } from 'luxon'
import { createEffect, untrack } from 'solid-js'

export default function () {
  const navigate = useNavigate()
  createEffect(() => {
    if (gameStore.current && gameStore.current.archive_at && !accountStore.permissions.includes(Permission.Game)) {
      untrack(() => {
        if (gameStore.current?.archive_at && gameStore.current.archive_at > DateTime.now()) {
          addToast({
            level: 'warning',
            description: t('game.writeupsOnlyOpenWhenArchived')!,
            duration: 10 * 1000,
          })
          navigate(`/games/${gameStore.current.id}`)
        }
      })
    }
  })
  return <></>
}

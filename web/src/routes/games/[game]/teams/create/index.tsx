import { canParticipate, gameStore } from '@/lib/storage/game'
import { Title } from '@/lib/storage/header'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import { useNavigate } from '@solidjs/router'
import { createEffect } from 'solid-js'

export default function () {
  const navigate = useNavigate()
  createEffect(() => {
    if (gameStore.current && !canParticipate()) {
      addToast({
        level: 'warning',
        description: t('game.canNotParticipate')!,
        duration: 5000,
      })
      navigate(`/games/${gameStore.current.id}`, { replace: true })
    }
  })
  return (
    <>
      <Title title={`${t('game.team.create.title')} - ${gameStore.current?.name || 'CTF'}`} />
    </>
  )
}

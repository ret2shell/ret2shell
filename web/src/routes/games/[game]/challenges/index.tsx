import { gameStore } from '@/lib/storage/game'
import { Title } from '@/lib/storage/header'
import { t } from '@/lib/storage/theme'

export default function () {
  return (
    <>
      <Title title={`${t('game.challenge.title')} - ${gameStore.current?.name || 'CTF'}`} />
    </>
  )
}

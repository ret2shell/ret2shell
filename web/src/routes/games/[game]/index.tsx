import { gameStore } from '@/lib/storage/game'
import { Title } from '@/lib/storage/header'

export default function () {
  return (
    <>
      <Title title={gameStore.current?.name || 'CTF'} />
      <div class="flex-1 flex flex-col lg:flex-row">
        <div class="lg:w-1/3 min-h-48 max-h-[calc(100vh-4rem)] sticky top-16 left-0 flex flex-col"></div>
        <div class="flex-1"></div>
      </div>
    </>
  )
}

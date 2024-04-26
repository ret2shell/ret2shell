import { gameStore } from '@/lib/storage/game'
import { Title } from '@/lib/storage/header'
import { t } from '@/lib/storage/theme'
import { JSX } from 'solid-js'

export default function (props: { children?: JSX.Element }) {
  return (
    <>
      <Title title={`${t('game.admin.title')} - ${gameStore.current?.name || 'CTF'}`} />
      {props.children}
    </>
  )
}

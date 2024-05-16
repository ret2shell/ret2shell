import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { JSX, onCleanup } from 'solid-js'
import Cover from './_blocks/cover'
import { setGameStore } from '@/lib/storage/game'

export default function (props: { children?: JSX.Element }) {
  onCleanup(() => {
    setGameStore({ current: null, games: [], preload: null })
  })
  return (
    <>
      <Title title={`${t('game.title')} - ${platformStore.config.name || t('platform.name')}`} />
      {props.children}
      <Cover />
    </>
  )
}

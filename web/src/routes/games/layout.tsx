import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { JSX } from 'solid-js'

export default function (props: { children?: JSX.Element }) {
  return (
    <>
      <Title title={`${t('game.title')} - ${platformStore.config.name || t('platform.name')}`} />
      {props.children}
    </>
  )
}

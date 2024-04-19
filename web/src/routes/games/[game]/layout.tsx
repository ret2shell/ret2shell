import { gameStore, setGameStore } from '@/lib/storage/game'
import { JSX, onCleanup } from 'solid-js'

export default function (props: { children?: JSX.Element }) {
  onCleanup(() => {
    setGameStore({ current: null })
  })
  return <>{props.children}</>
}

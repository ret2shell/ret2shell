import { getGame } from '@/lib/api/game'
import { gameStore, setGameStore } from '@/lib/storage/game'
import { useParams } from '@solidjs/router'
import { JSX, onCleanup } from 'solid-js'

export default function (props: { children?: JSX.Element }) {
  onCleanup(() => {
    setGameStore({ current: null })
  })
  const params = useParams()
  const game_id = parseInt(params.game)
  if (!gameStore.current && game_id) {
    getGame(game_id).then(resp => {
      setGameStore({ current: resp })
    })
  }
  return <>{props.children}</>
}

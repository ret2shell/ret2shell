import { JSX } from 'solid-js'
import './styles/card.scss'

export default function (props: {
  solid?: boolean
  classList?: { [k: string]: boolean }
  class?: string
  contentClassList?: { [k: string]: boolean }
  contentClass?: string
  children?: JSX.Element
}) {
  const mergedClassesList = {
    card: true,
    'card-solid': props.solid,
    ...props.classList,
  }
  return (
    <div classList={mergedClassesList} class={props.class}>
      <div class={`card-content ${props.contentClass}`} classList={props.contentClassList}>
        {props.children}
      </div>
    </div>
  )
}

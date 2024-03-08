import { JSX } from 'solid-js'
import './styles/card.scss'

export default function (props: {
  solid?: boolean
  class?: string
  classList?: { [k: string]: boolean }
  children?: JSX.Element
}) {
  const classes = `card ${props.solid ? 'card-solid' : ''}`
  return (
    <div class={classes} classList={props.classList}>
      <div class={`card-content ${props.class}`}>{props.children}</div>
    </div>
  )
}

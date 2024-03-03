import { JSX } from 'solid-js'

export default function (props: {
  solid?: boolean
  class?: string
  classList?: { [k: string]: boolean }
  children?: JSX.Element
}) {
  const classes = `${props.solid ? 'bg-layer' : 'bg-layer/60 backdrop-blur'} transition-colors duration-700 border border-layer-content/10 rounded-xl overflow-hidden`
  return (
    <div class={classes} classList={props.classList}>
      <div class={`bg-layer-content/5 overflow-hidden  ${props.class}`}>{props.children}</div>
    </div>
  )
}

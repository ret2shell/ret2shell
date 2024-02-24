import { Button } from '@kobalte/core'
import './styles/button.scss'
import { JSX, Show, children } from 'solid-js'
import Spin from '../assets/animates/spin'

export default function (props: {
  children?: JSX.Element
  level?: 'primary' | 'info' | 'success' | 'warning' | 'error' | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  ghost?: boolean
  bold?: boolean
  justify?: 'start' | 'center' | 'end'
  uppercase?: boolean
  loading?: boolean
  disabled?: boolean
  square?: boolean
  type?: 'button' | 'submit' | 'reset'
}) {
  const classList = [
    'btn',
    props.level && `btn-${props.level}`,
    props.size && `btn-${props.size}`,
    props.ghost && 'btn-ghost',
    props.bold && 'btn-bold',
    props.justify && `justify-${props.justify}`,
    props.uppercase && 'uppercase',
    props.disabled && 'disabled',
    props.square && 'btn-square',
  ]
  return (
    <Button.Root disabled={props.disabled} type={props.type} class={classList.filter(Boolean).join(' ')}>
      <Show when={props.loading}>
        <Spin />
      </Show>
      {children(() => props.children)()}
    </Button.Root>
  )
}

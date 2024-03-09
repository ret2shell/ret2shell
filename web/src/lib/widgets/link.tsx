import './styles/button.scss'
import { ComponentProps, JSX, Show, children } from 'solid-js'
import Spin from '../assets/animates/spin'
import { useMatch } from '@solidjs/router'

export default function (
  props: ComponentProps<'a'> & {
    children?: JSX.Element
    level?: 'primary' | 'info' | 'success' | 'warning' | 'error' | null
    size?: 'sm' | 'md'
    ghost?: boolean
    bold?: boolean
    justify?: 'start' | 'center' | 'end'
    uppercase?: boolean
    loading?: boolean
    disabled?: boolean
    square?: boolean
    type?: 'button' | 'submit' | 'reset'
    activeMatch?: 'prefix' | 'exact'
  }
) {
  const match = useMatch(() => (props.activeMatch === 'exact' ? props.href! : `${props.href}/*`))
  const classList = () => {
    return {
      btn: true,
      // btn-primary btn-info btn-success btn-warning btn-error
      [`btn-${props.level}`]: !!props.level,
      // btn-sm btn-md
      [`btn-${props.size || 'md'}`]: true,
      'btn-ghost': props.ghost,
      'btn-bold': props.bold,
      // justify-start justify-center justify-end
      [`justify-${props.justify || 'center'}`]: true,
      uppercase: props.uppercase,
      disabled: props.disabled,
      'btn-square': props.square,
      'btn-active': props.activeMatch ? Boolean(match()) : false,
    }
  }
  return (
    <a disabled={props.disabled} type={props.type} {...props} classList={classList()}>
      <Show when={props.loading}>
        <Spin />
      </Show>
      {children(() => props.children)()}
    </a>
  )
}

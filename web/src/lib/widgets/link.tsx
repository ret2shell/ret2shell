import { Link } from '@kobalte/core'
import './styles/button.scss'
import { JSX, Show, children } from 'solid-js'
import Spin from '../assets/animates/spin'
import { useMatch } from '@solidjs/router'
import { LinkRootProps } from '@kobalte/core/dist/types/link'

export default function (
  props: LinkRootProps & {
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
      [`btn-${props.size}`]: !!props.size,
      'btn-ghost': props.ghost,
      'btn-bold': props.bold,
      // justify-start justify-center justify-end
      [`justify-${props.justify}`]: !!props.justify,
      uppercase: props.uppercase,
      disabled: props.disabled,
      'btn-square': props.square,
      'btn-active': props.activeMatch ? Boolean(match()) : false,
    }
  }
  return (
    <Link.Root disabled={props.disabled} type={props.type} classList={classList()} {...props}>
      <Show when={props.loading}>
        <Spin />
      </Show>
      {children(() => props.children)()}
    </Link.Root>
  )
}

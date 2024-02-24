import { Link } from '@kobalte/core'
import './styles/button.scss'
import { JSX, Show, children } from 'solid-js'
import Spin from '../assets/animates/spin'
import { useMatch } from '@solidjs/router'

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
  href: string
  activeMatch?: 'prefix' | 'exact'
}) {
  const match = useMatch(() => (props.activeMatch === 'exact' ? props.href : `${props.href}/*`))
  const classList = () => {
    return {
      btn: true,
      [`btn-${props.level}`]: !!props.level,
      [`btn-${props.size}`]: !!props.size,
      'btn-ghost': props.ghost,
      'btn-bold': props.bold,
      [`justify-${props.justify}`]: !!props.justify,
      uppercase: props.uppercase,
      disabled: props.disabled,
      'btn-square': props.square,
      'btn-active': props.activeMatch ? Boolean(match()) : false,
    }
  }
  return (
    <Link.Root disabled={props.disabled} type={props.type} classList={classList()} href={props.href}>
      <Show when={props.loading}>
        <Spin />
      </Show>
      {children(() => props.children)()}
    </Link.Root>
  )
}

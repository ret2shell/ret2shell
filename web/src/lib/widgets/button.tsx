import './styles/button.scss'
import { ComponentProps, JSX, Show, children, splitProps } from 'solid-js'
import Spin from '@assets/animates/spin'

export default function (
  props: ComponentProps<'button'> & {
    children?: JSX.Element
    level?: 'primary' | 'info' | 'success' | 'warning' | 'error' | null
    size?: 'sm' | 'md'
    ghost?: boolean
    bold?: boolean
    justify?: 'start' | 'center' | 'end'
    uppercase?: boolean
    loading?: boolean
    square?: boolean
  }
) {
  const [others, btnProps] = splitProps(props, [
    'children',
    'level',
    'size',
    'ghost',
    'bold',
    'justify',
    'uppercase',
    'loading',
    'square',
  ])
  const classList = {
    btn: true,
    // btn-primary btn-info btn-success btn-warning btn-error
    [`btn-${others.level}`]: !!others.level,
    // btn-sm btn-md
    [`btn-${others.size || 'md'}`]: true,
    'btn-ghost': others.ghost,
    'btn-bold': others.bold,
    // justify-start justify-center justify-end
    [`justify-${others.justify || 'center'}`]: true,
    uppercase: others.uppercase,
    disabled: btnProps.disabled,
    'btn-square': others.square,
    ...btnProps.classList,
  }

  const size = others.size === 'sm' ? 16 : 24

  return (
    <button {...btnProps} classList={classList}>
      <Show when={props.loading}>
        <Spin width={size} height={size} />
      </Show>
      {children(() => props.children)()}
    </button>
  )
}

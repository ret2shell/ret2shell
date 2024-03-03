import { Popover } from '@kobalte/core'
import { Placement } from '@kobalte/core/dist/types/popper/utils'
import { JSX } from 'solid-js'
export default function (props: {
  children?: JSX.Element
  btnContent?: JSX.Element
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
  placement?: Placement
  padding?: string
}) {
  const classList = {
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
  }
  return (
    <Popover.Root fitViewport placement={props.placement}>
      <Popover.Trigger classList={classList}>{props.btnContent}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class={`focus:outline-none ${props.padding}`}>{props.children}</Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

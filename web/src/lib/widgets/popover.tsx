import { Popover } from '@ark-ui/solid'
import { Portal } from 'solid-js/web'
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
  padding?: string
  title?: string
}) {
  const classList = {
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
  }
  return (
    <Popover.Root autoFocus={false}>
      <Popover.Trigger classList={classList} title={props.title}>
        {props.btnContent}
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content class={`${props.padding}`}>{props.children}</Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}

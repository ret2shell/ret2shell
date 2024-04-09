import { ComponentProps, JSX, Show, createSignal, splitProps } from 'solid-js'
import './styles/input.scss'
import { Popover } from '@ark-ui/solid'
import { Portal } from 'solid-js/web'

export type TextInputProps = {
  icon?: JSX.Element
  extraBtn?: JSX.Element
  size?: 'sm' | 'md'
  error?: string
}

export default function (props: TextInputProps & ComponentProps<'input'>) {
  const size = props.size || 'md'
  const [inputProps, others] = splitProps(props, ['icon', 'extraBtn', 'size', 'error'])
  const mergedInputClasses = () =>
    `input w-0 flex-1 input-${size} ${inputProps.icon ? '!rounded-l-none' : ''} ${others.type === 'password' || inputProps.extraBtn ? '!rounded-r-none' : ''} ${inputProps.error ? 'input-error' : ''}`

  const mergedClasses = () =>
    `flex flex-col relative space-y-1 ${props.class ? `${props.class}` : ''} ${
      props.classList &&
      Object.keys(props.classList)
        .filter(k => props.classList && props.classList[k])
        .join(' ')
    }`

  const [type, setType] = createSignal(props.type)
  return (
    <>
      <Popover.Root autoFocus={false} open={!!props.error} closeOnInteractOutside={false}>
        <Popover.Anchor class={mergedClasses()}>
          <label class="text-sm font-bold text-layer-content/60" for={props.name}>
            {props.title || props.placeholder}
          </label>
          <div class="flex flex-row">
            <Show when={props.icon}>
              {/* rounded-l-lg rounded-l-md */}
              <div
                class={`rounded-l-${size === 'md' ? 'lg' : 'md'} flex flex-shrink-0 flex-row items-center justify-center h-12 w-12 bg-layer-content/20`}
              >
                {props.icon}
              </div>
            </Show>
            <input id={props.name} {...others} data-part="trigger" class={mergedInputClasses()} type={type()} />
            <Show when={props.type === 'password'}>
              {/* btn-sm btn-md */}
              <button
                class={`btn !rounded-l-none btn-${size} justify-center ${props.extraBtn ? '!rounded-none' : ''}`}
                onClick={() => setType(type() === 'password' ? 'text' : 'password')}
                type="button"
              >
                {/* icon-[fluent--eye-20-regular] icon-[fluent--eye-off-20-regular] */}
                <span class={`icon-[fluent--${type() === 'password' ? 'eye' : 'eye-off'}-20-regular] w-5 h-5`}></span>
              </button>
            </Show>
            <Show when={props.extraBtn}>{props.extraBtn}</Show>
          </div>
        </Popover.Anchor>
        <Portal>
          <Popover.Positioner>
            <Popover.Content class={`card ${props.error ? 'card-error' : ''} z-50`}>
              <p class="card-content px-4 p-2">{props.error}</p>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    </>
  )
}

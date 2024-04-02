import { JSX, Show, createSignal } from 'solid-js'
import './styles/input.scss'

export type TextInputProps = {
  name: string
  placeholder?: string
  value?: string | undefined
  required?: boolean
  ref?: (element: HTMLInputElement) => void
  onInput?: JSX.EventHandler<HTMLInputElement, InputEvent>
  onChange?: JSX.EventHandler<HTMLInputElement, Event>
  onBlur?: JSX.EventHandler<HTMLInputElement, FocusEvent>
  autofocus?: boolean
  disabled?: boolean
  readonly?: boolean
  class?: string
  classList?: { [k: string]: boolean }
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url'
  icon?: JSX.Element
  extraBtn?: JSX.Element
  size?: 'sm' | 'md'
  title?: string
  autocomplete?: string
}

export default function (props: TextInputProps) {
  const size = props.size || 'md'
  const mergedInputClasses =
    // input-sm input-md
    `input flex-1 w-0 input-${size} ${props.icon ? '!rounded-l-none' : ''} ${props.type === 'password' || props.extraBtn ? '!rounded-r-none' : ''}`
  const mergedClasses =
    (props.class ? ` ${props.class} ` : ' ') +
    (props.classList &&
      Object.keys(props.classList)
        .filter(k => props.classList && props.classList[k])
        .join(' ')) +
    'flex flex-col space-y-1'
  const [type, setType] = createSignal(props.type)
  return (
    <>
      <div class={mergedClasses}>
        <label class="text-sm font-bold text-layer-content/60">{props.title || props.placeholder}</label>
        <div class="flex flex-row">
          <Show when={props.icon}>
            {/* rounded-l-lg rounded-l-md */}
            <div
              class={`rounded-l-${size === 'md' ? 'lg' : 'md'} flex flex-shrink-0 flex-row items-center justify-center h-12 w-12 bg-layer-content/20`}
            >
              {props.icon}
            </div>
          </Show>
          <input {...props} class={mergedInputClasses} type={type()} />
          <Show when={props.type === 'password'}>
            {/* btn-sm btn-md */}
            <button
              class={`btn !rounded-l-none btn-square btn-${size} justify-center ${props.extraBtn ? '!rounded-none' : ''}`}
              onClick={() => setType(type() === 'password' ? 'text' : 'password')}
            >
              {/* icon-[fluent--eye-20-regular] icon-[fluent--eye-off-20-regular] */}
              <span class={`icon-[fluent--${type() === 'password' ? 'eye' : 'eye-off'}-20-regular] w-5 h-5`}></span>
            </button>
          </Show>
          <Show when={props.extraBtn}>{props.extraBtn}</Show>
        </div>
      </div>
    </>
  )
}

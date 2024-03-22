import Card from '@/lib/widgets/card'
import { Match, Show, Switch } from 'solid-js'

function Toast(props: {
  description: string
  level: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  reject?: () => void
  rejectLabel?: string
  accept?: () => void
  acceptLabel?: string
}) {
  return (
    <>
      <Card class="relative p-2">
        <div class="flex-shrink-0 flex flex-row items-center">
          <div class="flex flex-row space-x-2 flex-1 items-center">
            <Switch>
              <Match when={props.level === 'info'}>
                <span class="icon-[fluent--info-20-regular] w-5 h-5 text-info" />
              </Match>
              <Match when={props.level === 'warning'}>
                <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-warning" />
              </Match>
              <Match when={props.level === 'success'}>
                <span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success" />
              </Match>
              <Match when={props.level === 'error'}>
                <span class="icon-[fluent--dismiss-circle-20-regular] w-5 h-5 text-error" />
              </Match>
            </Switch>
          </div>
          <span class="text-base">{props.description}</span>
          <div class="flex-1" />
          <Show when={props.reject && props.rejectLabel}>
            <button class="btn no-animation btn-sm btn-ghost" onClick={props.reject}>
              {props.rejectLabel}
            </button>
          </Show>
          <Show when={props.accept && props.acceptLabel}>
            <button class="btn no-animation btn-sm btn-primary" onClick={props.accept}>
              {props.acceptLabel}
            </button>
          </Show>
        </div>
      </Card>
    </>
  )
}

export default function () {
  return <div class="fixed bottom-0 right-0 xl:max-w-[60vw] flex flex-col items-end p-4 space-y-4"></div>
}

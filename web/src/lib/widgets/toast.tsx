import { ComponentProps, Show, onMount, splitProps } from 'solid-js'
import Card from './card'
import Button from './button'
import { t } from '../storage/theme'
import { ToastMessage, removeToast } from '../storage/toast'

export type ToastProps = {
  toast: ToastMessage
  selfDestroy?: boolean
  onTimeout?: () => void
}

export default function (props: ComponentProps<'div'> & ToastProps) {
  const [toast, others] = splitProps(props, ['toast'])
  let progressRef: HTMLDivElement
  onMount(() => {
    if (props.selfDestroy) {
      setTimeout(() => {
        progressRef.classList.remove('w-full')
        progressRef.style.transitionDuration = toast.toast.duration + 'ms'
        progressRef.classList.add('w-0')
      }, 100)
      setTimeout(
        () => {
          props.onTimeout?.()
        },
        (toast.toast.duration || 0) + 100
      )
    }
  })
  return (
    <>
      <Card {...others} contentClass="p-2 group relative">
        <div class="flex flex-col space-y-2">
          <div class="inline-block space-x-2 px-2 py-1">
            <span class={`text-${toast.toast.level}`}>[{toast.toast.level[0]}]</span>
            <span>{toast.toast.description}</span>
          </div>
          <Show when={toast.toast.reject || toast.toast.accept}>
            <div class="flex flex-row items-center justify-end space-x-2">
              <Show when={toast.toast.reject}>
                <Button size="sm" ghost onClick={toast.toast.reject}>
                  {toast.toast.rejectLabel || t('platform.reject')}
                </Button>
              </Show>
              <Show when={toast.toast.accept}>
                <Button size="sm" level="primary" onClick={toast.toast.accept}>
                  {toast.toast.acceptLabel || t('platform.accept')}
                </Button>
              </Show>
            </div>
          </Show>
        </div>
        <Button
          class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          size="sm"
          square
          onClick={() => removeToast(toast.toast.id)}
        >
          <span class="icon-[fluent--dismiss-20-regular] w-5 h-5"></span>
        </Button>
        <Show when={props.selfDestroy}>
          {/* bg-info bg-success bg-warning bg-error */}
          <div class="absolute bottom-1 left-4 h-[2px] right-4">
            <div ref={progressRef!} class={`w-full h-full bg-${toast.toast.level} transition-all ease-linear`}></div>
          </div>
        </Show>
      </Card>
    </>
  )
}

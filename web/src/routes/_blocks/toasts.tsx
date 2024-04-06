import { toastStore } from '@/lib/storage/toast'
import Toast from '@/lib/widgets/toast'
import { DateTime } from 'luxon'
import { For, Show, createEffect, createSignal } from 'solid-js'
import { TransitionGroup } from 'solid-transition-group'

export default function () {
  const [toasts, setToasts] = createSignal(toastStore.toasts)
  createEffect(() => {
    setToasts(toastStore.toasts)
  })
  return (
    <>
      <div class="fixed bottom-2 right-2 w-96 flex flex-col space-y-2">
        <TransitionGroup name="toast">
          <For each={toasts()}>
            {toast => (
              <Show
                when={
                  toast.duration === undefined ||
                  toast.duration <= 0 ||
                  toast.createdAt + toast.duration > DateTime.now().toMillis()
                }
              >
                <Toast
                  toast={toast}
                  selfDestroy
                  onTimeout={() => {
                    setToasts(toasts().filter(item => item.id !== toast.id))
                  }}
                />
              </Show>
            )}
          </For>
        </TransitionGroup>
      </div>
    </>
  )
}

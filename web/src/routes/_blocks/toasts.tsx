import { toastStore } from '@/lib/storage/toast'
import Toast from '@/lib/widgets/toast'
import { DateTime } from 'luxon'
import { For, Show, createEffect, createSignal } from 'solid-js'
import { Motion, Presence } from 'solid-motionone'

export default function () {
  const [toasts, setToasts] = createSignal(toastStore.toasts)
  createEffect(() => {
    setToasts(toastStore.toasts)
  })
  return (
    <>
      <Presence>
        <div class="fixed bottom-2 right-2 w-96 flex flex-col space-y-2">
          <For each={toasts()}>
            {toast => (
              <Show
                when={
                  toast.duration === undefined ||
                  toast.duration <= 0 ||
                  toast.createdAt + toast.duration > DateTime.now().toMillis()
                }
              >
                <Motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.3 }}
                >
                  <Toast
                    toast={toast}
                    selfDestroy
                    onTimeout={() => {
                      setToasts(toasts().filter(item => item.id !== toast.id))
                    }}
                  />
                </Motion.div>
              </Show>
            )}
          </For>
        </div>
      </Presence>
    </>
  )
}

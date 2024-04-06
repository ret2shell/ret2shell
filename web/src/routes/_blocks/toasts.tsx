import { toastStore } from '@/lib/storage/toast'
import Toast from '@/lib/widgets/toast'
import { DateTime } from 'luxon'
import { For, Show, createEffect, createSignal } from 'solid-js'

export default function () {
  const [toasts, setToasts] = createSignal(toastStore.toasts)
  createEffect(() => {
    setToasts(toastStore.toasts)
  })
  return (
    <>
      <div class="fixed bottom-2 right-2 w-96 flex flex-col space-y-2">
        <For each={toasts()}>
          {toast => (
            <Show when={toast.createdAt + (toast.duration || 0) > DateTime.now().toMillis()}>
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
      </div>
    </>
  )
}

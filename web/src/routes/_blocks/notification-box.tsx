import { clearToasts, removeToast, toastStore } from '@/lib/storage/toast'
import Button from '@/lib/widgets/button'
import { t } from '@storage/theme'
import Card from '@widgets/card'
import Popover from '@widgets/popover'
import { For, Show } from 'solid-js'

export default function NotificationBox() {
  // Level colors
  // text-info text-warning text-primary text-error text-success
  return (
    <>
      <Popover
        btnContent={
          <span
            class={`${toastStore.toasts.length > 0 ? 'icon-[fluent--alert-badge-20-filled] text-primary' : 'icon-[fluent--alert-20-regular]'} w-5 h-5`}
          />
        }
        square
        ghost
        padding="pt-2"
        title={t('platform.notificationBox')}
      >
        <div class="flex flex-col space-y-2 w-96">
          <Card contentClass="p-2 h-12 flex flex-row items-center space-x-2">
            <h2 class="px-2 flex-1 flex items-center space-x-2 font-bold">
              <span class="icon-[fluent--alert-20-regular] w-5 h-5" />
              <Show
                when={toastStore.toasts.length > 0}
                fallback={<span class="opacity-60">{t('platform.noNotifications')}</span>}
              >
                <span>{t('platform.notificationBox')}</span>
              </Show>
            </h2>
            <Show when={toastStore.toasts.length > 0}>
              <Button size="sm" ghost level="info" onClick={() => clearToasts()}>
                {t('platform.clearNotifications')}
              </Button>
            </Show>
          </Card>
          <For each={toastStore.toasts}>
            {toast => (
              <Card contentClass="p-2 group relative">
                <div class="flex flex-col space-y-2">
                  <div class="inline-block space-x-2 px-2 py-1">
                    <span class={`text-${toast.level}`}>[{toast.level[0]}]</span>
                    <span>{toast.description}</span>
                  </div>
                  <Show when={toast.reject || toast.accept}>
                    <div class="flex flex-row items-center justify-end space-x-2">
                      <Show when={toast.reject}>
                        <Button size="sm" ghost onClick={toast.reject}>
                          {toast.rejectLabel || t('platform.reject')}
                        </Button>
                      </Show>
                      <Show when={toast.accept}>
                        <Button size="sm" level="primary" onClick={toast.accept}>
                          {toast.acceptLabel || t('platform.accept')}
                        </Button>
                      </Show>
                    </div>
                  </Show>
                </div>
                <Button
                  class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  size="sm"
                  square
                  onClick={() => removeToast(toast.id)}
                >
                  <span class="icon-[fluent--dismiss-20-regular] w-5 h-5"></span>
                </Button>
              </Card>
            )}
          </For>
        </div>
      </Popover>
    </>
  )
}

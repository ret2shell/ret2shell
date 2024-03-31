import { toastStore } from '@/lib/storage/toast'
import Button from '@/lib/widgets/button'
import { t } from '@storage/theme'
import Card from '@widgets/card'
import Popover from '@widgets/popover'
import { Show } from 'solid-js'

export default function NotificationBox() {
  return (
    <>
      <Popover
        btnContent={
          <span
            class={`${toastStore.toasts.length > 0 ? 'icon-[fluent--alert-badge-20-regular] text-primary' : 'icon-[fluent--alert-20-regular]'} w-5 h-5`}
          />
        }
        square
        ghost
        padding="pt-2"
        title={t('platform.notificationBox')}
      >
        <div class="flex flex-col space-y-2 w-80">
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
              <Button size="sm" ghost level="info">
                {t('platform.clearNotifications')}
              </Button>
            </Show>
          </Card>
        </div>
      </Popover>
    </>
  )
}

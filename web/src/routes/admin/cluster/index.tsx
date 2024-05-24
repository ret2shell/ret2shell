import { t } from '@/lib/storage/theme'
import Divider from '@/lib/widgets/divider'
import { Show, createSignal } from 'solid-js'

export default function () {
  const [available, setAvailable] = createSignal(false)
  return (
    <>
      <div class="flex-1 flex flex-col p-3 lg:p-6">
        <div class="h-48 flex flex-row items-center">
          <div class="h-full aspect-square flex items-center justify-center">
            <Show when={available()} fallback={<span class="icon-[meteocons--code-red-fill] w-full h-full"></span>}>
              <span class="icon-[meteocons--compass-fill] w-full h-full"></span>
            </Show>
          </div>
          <h1 class="flex flex-col justify-center space-y-2">
            <span class="text-5xl font-bold">Kubernetes</span>
            <Show when={available()} fallback={<span class="text-warning">{t('admin.cluster.unavailable')}</span>}>
              <span class="text-info">{t('admin.cluster.available')}</span>
            </Show>
          </h1>
        </div>
        <Divider />
      </div>
    </>
  )
}

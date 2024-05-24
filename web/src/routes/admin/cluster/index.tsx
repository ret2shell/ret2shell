import { getClusterConfig } from '@/lib/api/cluster'
import Spin from '@/lib/assets/animates/spin'
import { t } from '@/lib/storage/theme'
import Divider from '@/lib/widgets/divider'
import LoadingTips from '@/lib/widgets/loading-tips'
import { DateTime } from 'luxon'
import { Match, Show, Switch, createSignal } from 'solid-js'

export default function () {
  const [available, setAvailable] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const configShownKeys = ['since', 'clusterDNS', 'clusterDomain']
  const [since, setSince] = createSignal('')
  const [clusterDNS, setClusterDNS] = createSignal('')
  const [clusterDomain, setClusterDomain] = createSignal('')
  getClusterConfig()
    .then(resp => {
      setAvailable(true)
      for (const c of resp.items) {
        if (c.data && c.data.since) {
          setSince(c.data.since)
        }
        if (c.data && c.data.clusterDNS) {
          setClusterDNS(c.data.clusterDNS)
        }
        if (c.data && c.data.clusterDomain) {
          setClusterDomain(c.data.clusterDomain)
        }
      }
    })
    .catch(() => {
      setAvailable(false)
    })
    .finally(() => {
      setLoading(false)
    })
  return (
    <>
      <div class="flex-1 flex flex-col p-3 lg:p-6">
        <div class="h-32 lg:h-48 flex flex-row items-center">
          <div class="h-full aspect-square flex items-center justify-center">
            <Switch>
              <Match when={loading()}>
                <Spin width={24} height={24} />
              </Match>
              <Match when={available()}>
                <span class="icon-[meteocons--compass] w-full h-full"></span>
              </Match>
              <Match when={true}>
                <span class="icon-[meteocons--code-red-fill] w-full h-full"></span>
              </Match>
            </Switch>
          </div>
          <h1 class="flex flex-col justify-center space-y-2">
            <span class="text-3xl lg:text-5xl font-bold">Kubernetes</span>
            <Switch>
              <Match when={loading()}>
                <LoadingTips />
              </Match>
              <Match when={available()}>
                <span class="text-info">{t('admin.cluster.available')}</span>
              </Match>
              <Match when={true}>
                <span class="text-warning">{t('admin.cluster.unavailable')}</span>
              </Match>
            </Switch>
          </h1>
        </div>
        <Divider />
        <Show when={available()}>
          <div class="h-12 flex flex-row space-x-4 items-center px-4">
            <span class="flex-1 opacity-60">
              Since {since()}, {DateTime.fromFormat(since(), 'yyyy-MM-dd').diffNow().negate().toFormat('hh')} hours
              online
            </span>
            <span>{clusterDomain()}</span>
            <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5 opacity-60"></span>
            <span class="text-warning">{clusterDNS()}</span>
          </div>
          <Divider />
        </Show>
        <Show when={loading()}>
          <div class="h-8 flex flex-row space-x-4 items-center px-4">
            <LoadingTips />
          </div>
        </Show>
      </div>
    </>
  )
}

import { ClusterNode, getClusterConfig, getClusterNodes } from '@/lib/api/cluster'
import Spin from '@/lib/assets/animates/spin'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import Card from '@/lib/widgets/card'
import Divider from '@/lib/widgets/divider'
import LoadingTips from '@/lib/widgets/loading-tips'
import { HTTPError } from '@reverier/ky'
import { DateTime } from 'luxon'
import { For, Match, Show, Switch, createSignal } from 'solid-js'

export default function () {
  const [available, setAvailable] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const configShownKeys = ['since', 'clusterDNS', 'clusterDomain']
  const [since, setSince] = createSignal('')
  const [clusterDNS, setClusterDNS] = createSignal('')
  const [clusterDomain, setClusterDomain] = createSignal('')
  const [clusterNodes, setClusterNodes] = createSignal([] as ClusterNode[])
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
  getClusterNodes()
    .then(resp => {
      setClusterNodes(resp.items)
    })
    .catch((err: HTTPError) => {
      err.response.text().then(text => {
        addToast({
          level: 'error',
          description: `${t('admin.cluster.failedToFetchNodes')}: ${text}`,
        })
      })
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
        <Show when={loading()}>
          <div class="h-8 flex flex-row space-x-4 items-center px-4">
            <LoadingTips />
          </div>
          <Divider />
        </Show>
        <Show when={available()}>
          <div class="h-20 lg:h-12 flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4 justify-center items-center px-4">
            <span class="lg:flex-1 opacity-60">
              Since {since()}, {DateTime.fromFormat(since(), 'yyyy-MM-dd').diffNow().negate().toFormat('hh')} hours
              online
            </span>
            <span class="flex flex-row items-center space-x-4">
              <span>{clusterDomain()}</span>
              <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5 opacity-60"></span>
              <span class="text-warning">{clusterDNS()}</span>
            </span>
          </div>
          <Divider />
          <div class="flex flex-col lg:flex-row items-center lg:items-start flex-wrap p-3 lg:p-6">
            <For each={clusterNodes()}>
              {node => (
                <>
                  <Card class="my-2 lg:mx-4 min-w-fit" contentClass="p-3 lg:p-6 flex flex-row space-x-4 min-w-fit">
                    <div class="h-16 w-16 flex-shrink-0 flex justify-center items-center">
                      <span class="icon-[fluent--organization-16-regular] w-8 h-8 lg:w-12 lg:h-12 text-success"></span>
                    </div>
                    <div class="flex flex-col justify-center space-y-2 min-w-fit">
                      <span class="font-bold">{node.metadata.name}</span>
                      <span class="opacity-60">{node.metadata.creationTimestamp}</span>
                    </div>
                  </Card>
                </>
              )}
            </For>
          </div>
          <Divider />
        </Show>
      </div>
    </>
  )
}

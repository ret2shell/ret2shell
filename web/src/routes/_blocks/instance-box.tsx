import Popover from '@widgets/popover'
import Card from '@widgets/card'
import { t } from '@storage/theme'
import Link from '@widgets/link'
import Button from '@widgets/button'
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import Timer from '@widgets/timer'
import Progress from '@widgets/progress'
import { Instance } from '@models/instance'
import { DateTime } from 'luxon'
import { wsrx } from '@/lib/wsrx'
import { accountStore } from '@/lib/storage/account'

export function InstanceBoxContent() {
  function calcProgress(instance: Instance, now: DateTime) {
    return (
      instance.started_at
        .plus({ hours: instance.renew_count + 1 })
        .diff(now)
        .toMillis() /
      ((instance.renew_count + 1) * 3600 * 10)
    )
  }

  const [connecting, setConnecting] = createSignal(false)

  function retryConnect() {
    wsrx.tryConnect()
    setConnecting(true)
    setTimeout(() => {
      setConnecting(false)
      wsrx.checkConnection()
    }, 5000)
  }

  createEffect(() => {
    if (accountStore.token) retryConnect()
  })

  const [now, setNow] = createSignal(DateTime.now())
  const timer = setInterval(() => {
    setNow(DateTime.now())
  }, 1000)
  onCleanup(() => {
    clearInterval(timer)
  })
  return (
    <div class="flex flex-col space-y-2 w-96">
      <Card contentClass="p-2 flex flex-row space-x-2">
        <Button
          disabled={connecting()}
          loading={connecting()}
          class="flex-1"
          justify="start"
          ghost
          title={t('instance.retryLinkWsrx')}
          size="sm"
          onClick={retryConnect}
        >
          <Show when={!connecting()}>
            <span
              class={`icon-[fluent--fluid-20-regular] w-5 h-5 ${wsrx.connected() ? 'text-success' : 'text-warning'}`}
            />
          </Show>
          <span
            class={connecting() ? 'text-base opacity-60' : wsrx.connected() ? 'text-success font-bold' : 'text-warning'}
          >
            {connecting()
              ? t('instance.connecting')
              : wsrx.connected()
                ? t('instance.connected')
                : t('instance.disconnected')}
          </span>
        </Button>
        <Link
          href="https://github.com/XDSEC/WebSocketReflectorX/releases"
          ghost
          square
          title={t('instance.downloadWsrx')}
          size="sm"
        >
          <span class="icon-[fluent--arrow-download-20-regular] w-5 h-5" />
        </Link>
      </Card>
      <For each={wsrx.instances()}>
        {instance => (
          <Card contentClass="p-2 flex flex-col space-y-2">
            <div class="flex flex-col">
              <div class="inline-flex flex-row justify-start items-center p-2 space-x-2">
                <span class="icon-[fluent--play-circle-hint-20-regular] w-5 h-5 text-success"></span>
                <span>{instance.challenge_name}</span>
                <span class="flex-1"></span>
                <Timer class="opacity-60" end={instance.started_at.plus({ hours: instance.renew_count + 1 })} />
              </div>
              <Progress class="px-2" min={0} max={100} value={calcProgress(instance, now())} />
            </div>
            <div class="flex flex-row space-x-2">
              <Button ghost size="sm" title={t('instance.copyWsrxAddr')}>
                <span class="icon-[fluent--copy-20-regular] w-5 h-5 text-success" />
                <span class="truncate text-nowrap opacity-60">WSRX</span>
              </Button>
              <Button
                ghost
                size="sm"
                title={wsrx.connected() ? t('instance.copyLocalAddr') : t('instance.needLocalDaemon')}
                disabled={wsrx.connected() === null}
              >
                <span class="icon-[fluent--copy-20-regular] w-5 h-5 text-info" />
                <span class="truncate text-nowrap opacity-60">LOCAL</span>
              </Button>
              <Button
                size="sm"
                square
                ghost
                title={wsrx.connected() ? t('instance.openLocalAddr') : t('instance.needLocalDaemon')}
                disabled={wsrx.connected() === null}
              >
                <span class="icon-[fluent--open-20-regular] w-5 h-5 text-info" />
              </Button>
              <div class="flex-1"></div>
              <Button size="sm" square ghost title={t('instance.renew')}>
                <span class="icon-[fluent--clock-alarm-20-regular] w-5 h-5 text-info" />
              </Button>
              <Button size="sm" square ghost title={t('instance.stop')}>
                <span class="icon-[fluent--record-stop-20-regular] w-5 h-5 text-error" />
              </Button>
            </div>
          </Card>
        )}
      </For>
    </div>
  )
}

export default function InstanceBox() {
  return (
    <>
      <Popover
        btnContent={
          <span
            class={`${wsrx.instances().length > 0 ? 'icon-[fluent--fluid-20-filled]' : 'icon-[fluent--fluid-20-regular]'} w-5 h-5 ${wsrx.instances().length > 0 ? (wsrx.connected() ? 'text-success' : 'text-warning') : ''}`}
          />
        }
        square
        ghost
        popContentClass="pt-2"
        title={t('instance.box')}
      >
        <InstanceBoxContent />
      </Popover>
    </>
  )
}

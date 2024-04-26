import Popover from '@widgets/popover'
import Card from '@widgets/card'
import { t } from '@storage/theme'
import Link from '@widgets/link'
import Button from '@widgets/button'
import { For, Show, createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import Timer from '@widgets/timer'
import Progress from '@widgets/progress'
import { Instance } from '@models/instance'
import { DateTime } from 'luxon'
import { WsrxState, wsrx } from '@/lib/wsrx'
import { accountStore } from '@/lib/storage/account'
import Input from '@/lib/widgets/input'
import { addToast } from '@/lib/storage/toast'

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
  const [showSettings, setShowSettings] = createSignal(false)

  function retryConnect() {
    wsrx.tryConnect().catch(() => {})
    setConnecting(true)
    setTimeout(() => {
      wsrx.checkConnection().then(() => {
        setConnecting(false)
      })
    }, 1000)
  }

  createEffect(() => {
    if (accountStore.token) untrack(retryConnect)
  })

  let cachedState = WsrxState.Disconnected

  createEffect(() => {
    if (wsrx.connected() === WsrxState.Disconnected && cachedState !== WsrxState.Disconnected) {
      addToast({
        level: 'warning',
        description: t('instance.wsrxDisconnected')!,
        duration: 10 * 1000,
      })
    }
    cachedState = wsrx.connected()
  })

  const [now, setNow] = createSignal(DateTime.now())
  const instanceTimer = setInterval(() => {
    setNow(DateTime.now())
  }, 1000)
  const heartbeatTimer = setInterval(() => {
    // Pending or Connected
    if (wsrx.connected()) {
      wsrx.checkConnection()
    }
  }, 5 * 1000)
  onCleanup(() => {
    clearInterval(instanceTimer)
    clearInterval(heartbeatTimer)
  })
  return (
    <div class="flex flex-col space-y-2 max-w-96 w-[calc(100vw-1rem)]">
      <Card contentClass="p-2 flex flex-row space-x-2">
        <Button
          disabled={connecting()}
          loading={connecting() || wsrx.connected() === WsrxState.Pending}
          class="flex-1"
          justify="start"
          ghost
          title={t('instance.retryLinkWsrx')}
          size="sm"
          onClick={retryConnect}
        >
          <Show when={!connecting() && wsrx.connected() !== WsrxState.Pending}>
            <span
              class={`icon-[fluent--fluid-20-regular] w-5 h-5 ${
                wsrx.connected() === WsrxState.Connected ? 'text-success' : 'text-warning'
              }`}
            />
          </Show>
          <span
            class={
              connecting()
                ? 'text-base opacity-60'
                : wsrx.connected() === WsrxState.Connected
                  ? 'text-success font-bold'
                  : 'text-warning'
            }
          >
            {connecting()
              ? t('instance.connecting')
              : wsrx.connected() === WsrxState.Connected
                ? t('instance.connected')
                : wsrx.connected() === WsrxState.Pending
                  ? t('instance.pending')
                  : t('instance.disconnected')}
          </span>
        </Button>
        <Button
          ghost={!showSettings()}
          square
          title={t('instance.wsrxSettings')}
          size="sm"
          onClick={() => setShowSettings(!showSettings())}
        >
          {/* icon-[fluent--settings-20-regular] icon-[fluent--settings-20-filled] */}
          <span
            class={`icon-[fluent--settings-20-${
              showSettings() ? 'filled' : 'regular'
            }] w-5 h-5 ${showSettings() ? 'text-primary' : ''}`}
          />
        </Button>
        <Link
          href="https://github.com/XDSEC/WebSocketReflectorX/releases"
          ghost
          square
          target="_blank"
          title={t('instance.downloadWsrx')}
          size="sm"
        >
          <span class="icon-[fluent--arrow-download-20-regular] w-5 h-5" />
        </Link>
      </Card>
      <Show when={showSettings()}>
        <Card contentClass="p-2 flex flex-row space-x-2">
          <Input
            size="sm"
            class="flex-1"
            placeholder="http://127.0.0.1:3307"
            value={wsrx.apiAddr()}
            onBlur={e => {
              wsrx.setApiAddr(e.target.value)
            }}
          ></Input>
          <Button
            size="sm"
            square
            title={t('instance.defaultApiAddr')}
            ghost
            onClick={() => {
              wsrx.setApiAddr('http://127.0.0.1:3307')
            }}
          >
            <span class="icon-[fluent--arrow-reset-20-regular] w-5 h-5"></span>
          </Button>
          {/* NOTE: Just a placable button, when you click it, the input box will trigger `onBlur` to save it. */}
          <Button size="sm" square title={t('form.save')} ghost>
            <span class="icon-[fluent--checkmark-20-regular] w-5 h-5"></span>
          </Button>
        </Card>
      </Show>
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

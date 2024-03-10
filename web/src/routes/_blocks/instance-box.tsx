import Popover from '../../lib/widgets/popover'
import Card from '../../lib/widgets/card'
import { wsrxStore } from '../../lib/storage/wsrx'
import { t } from '../../lib/storage/theme'
import Link from '../../lib/widgets/link'
import Button from '../../lib/widgets/button'
import { For, createSignal, onCleanup } from 'solid-js'
import Timer from '../../lib/widgets/timer'
import Progress from '../../lib/widgets/progress'
import { Instance } from '../../lib/models/instance'
import { DateTime } from 'luxon'

export default function InstanceBox() {
  function calcProgress(instance: Instance, now: DateTime) {
    return (
      instance.started_at
        .plus({ hours: instance.renew_count + 1 })
        .diff(now)
        .toMillis() /
      ((instance.renew_count + 1) * 3600 * 10)
    )
  }
  let [now, setNow] = createSignal(DateTime.now())
  let timer = setInterval(() => setNow(DateTime.now()), 1000)
  onCleanup(() => clearInterval(timer))
  return (
    <>
      <Popover
        btnContent={<span class="icon-[fluent--pair-20-regular] w-5 h-5" />}
        square
        ghost
        padding="pt-2"
        title={t('instance.box')}
      >
        <div class="flex flex-col space-y-2 w-96">
          <Card contentClass="p-2 flex flex-row space-x-2">
            <Button class="flex-1" justify="start" ghost title={t('instance.retryLinkWsrx')} size="sm">
              <span
                class={`icon-[fluent--pair-20-regular] w-5 h-5 ${wsrxStore.daemon ? 'text-success' : 'text-warning'}`}
              />
              <span class={wsrxStore.daemon ? 'text-success font-bold' : 'text-warning'}>
                {wsrxStore.daemon ? t('instance.connected') : t('instance.disconnected')}
              </span>
            </Button>
            <Link
              href="https://github.com/ret2shell/wsrx/releases"
              ghost
              square
              title={t('instance.downloadWsrx')}
              size="sm"
            >
              <span class="icon-[fluent--arrow-download-20-regular] w-5 h-5" />
            </Link>
          </Card>
          <For each={wsrxStore.instances}>
            {(instance, _i) => (
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
                    title={wsrxStore.daemon ? t('instance.copyLocalAddr') : t('instance.needLocalDaemon')}
                    disabled={wsrxStore.daemon === null}
                  >
                    <span class="icon-[fluent--copy-20-regular] w-5 h-5 text-info" />
                    <span class="truncate text-nowrap opacity-60">LOCAL</span>
                  </Button>
                  <Button
                    size="sm"
                    square
                    ghost
                    title={wsrxStore.daemon ? t('instance.openLocalAddr') : t('instance.needLocalDaemon')}
                    disabled={wsrxStore.daemon === null}
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
      </Popover>
    </>
  )
}

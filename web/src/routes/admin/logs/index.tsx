import { api_root } from '@/lib/api'
import { accountStore } from '@/lib/storage/account'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import { DateTime } from 'luxon'
import { For, createSignal, onCleanup } from 'solid-js'

type Log = {
  timestamp: string
  level: string
  target: string
  fields: {
    message: string
  }
  span?: {
    from?: string
    method?: string
    name?: string
    uri?: string
  }
}

export default function () {
  const [loading, setLoading] = createSignal(false)
  const [logs, setLogs] = createSignal([] as Log[])
  let ws: WebSocket

  function connect() {
    ws = new WebSocket(`${api_root}/platform/logs?token=${accountStore.token}`)
    setLoading(true)
    ws.onopen = () => {
      setLoading(false)
      setLogs([])
    }
    ws.onmessage = event => {
      let log: Log = JSON.parse(event.data)
      setLogs(logs().concat(log))
      setTimeout(() => {
        bottomDiv.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
    ws.onclose = () => {
      setLoading(true)
      addToast({
        level: 'error',
        description: t('admin.logs.socketClosed')!,
        duration: 5000,
      })
      setTimeout(() => {
        connect()
      }, 5000)
    }
    ws.onerror = () => {
      ws.close()
    }
  }
  connect()

  onCleanup(() => {
    ws.onclose = null
    ws.close()
  })

  function getColor(level: string) {
    switch (level) {
      case 'INFO':
        return 'text-info'
      case 'WARN':
        return 'text-warning'
      case 'ERROR':
        return 'text-error'
      case 'DEBUG':
        return 'text-gray-500'
      default:
        return 'text-info'
    }
  }
  function getContentColor(level: string) {
    switch (level) {
      case 'INFO':
        return 'text-layer-content'
      case 'WARN':
        return 'text-warning'
      case 'ERROR':
        return 'text-error'
      case 'DEBUG':
        return 'opacity-60'
      default:
        return 'text-layer-content'
    }
  }
  let bottomDiv: HTMLDivElement
  return (
    <div class="flex-1 flex flex-col p-3 lg:p-6">
      <For each={logs()}>
        {log => (
          <div class="h-8 flex flex-row items-center space-x-2 border-b border-b-layer-content/10 overflow-hidden min-w-0">
            <span class={`w-16 ${getColor(log.level)}`}>{log.level}</span>
            <span class="opacity-40">[{log.target}]</span>
            {log.span?.name && <span class="opacity-60">[{log.span.name}]</span>}
            {log.span?.method && <span class="opacity-60">[{log.span.method}]</span>}
            {log.span?.from && <span class="opacity-60">[{log.span.from}]</span>}
            {log.span?.uri && <span class="opacity-60">[{log.span.uri}]</span>}
            <span class={`flex-1 truncate w-0 ${getContentColor(log.level)}`} title={log.fields.message}>
              {log.fields.message}
            </span>
            <span class="opacity-60 font-bold">{DateTime.fromISO(log.timestamp).toFormat('yyyy-MM-dd HH:mm:ss')}</span>
          </div>
        )}
      </For>
      <div ref={bottomDiv!}></div>
    </div>
  )
}

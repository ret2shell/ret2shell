import { api_root } from '@/lib/api'
import { getPlatformLogs } from '@/lib/api/platform'
import { accountStore } from '@/lib/storage/account'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import Button from '@/lib/widgets/button'
import LoadingTips from '@/lib/widgets/loading-tips'
import Tag from '@/lib/widgets/tag'
import { HTTPError } from '@reverier/ky'
import { DateTime } from 'luxon'
import { For, Show, createSignal, onCleanup } from 'solid-js'

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
  const [enableStreamLogs, setEnableStreamLogs] = createSignal(false)
  const [logs, setLogs] = createSignal([] as Log[])
  let ws: WebSocket

  const [logFiles, setLogFiles] = createSignal([] as string[])
  getPlatformLogs()
    .then(resp => {
      setLogFiles(resp as string[])
    })
    .catch((err: HTTPError) => {
      void err.response.text().then(text => {
        addToast({
          level: 'error',
          description: `${t('admin.logs.failedToFetchLogsList')}: ${text}`,
          duration: 5000,
        })
      })
    })

  const [downloadingFile, setDownloadingFile] = createSignal(null as string | null)

  function downloadLog(file: string) {
    setDownloadingFile(file)
    void getPlatformLogs(file).then(blob => {
      const url = window.URL.createObjectURL(blob as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file
      a.click()
      window.URL.revokeObjectURL(url)
      setDownloadingFile(null)
    })
  }

  function disable() {
    if (ws) {
      ws.onclose = null
      ws.close()
    }
    setLogs([])
    setEnableStreamLogs(false)
  }

  function enable() {
    connect()
    setEnableStreamLogs(true)
  }

  function connect() {
    ws = new WebSocket(`${api_root}/platform/logs/stream?token=${accountStore.token}`)
    setLoading(true)
    ws.onopen = () => {
      setLoading(false)
      setLogs([])
    }
    ws.onmessage = event => {
      const log = JSON.parse(event.data as string) as Log
      setLogs(logs().concat(log))
      setTimeout(() => {
        bottomDiv.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
    ws.onclose = () => {
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

  onCleanup(disable)

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
    <>
      <Title title={`${t('admin.logs.title')} - ${platformStore.config.name || t('platform.name')}`}></Title>
      <div class="flex-1 flex flex-col">
        <div class="sticky top-16 h-16 z-20 backdrop-blur border-b border-b-layer-content/10 flex flex-row space-x-4 items-center px-3 lg:px-6">
          <h1 class="flex-1 font-bold flex flex-row space-x-2 items-center">
            <span class="icon-[fluent--code-20-regular] w-5 h-5"></span>
            <span>{t('admin.logs.title')}</span>
          </h1>
          <Show when={enableStreamLogs()}>
            <Tag level="success">
              <span>{t('admin.logs.streamingEnabled')}</span>
            </Tag>
          </Show>
          <Button
            onClick={() => (enableStreamLogs() ? disable() : enable())}
            size="sm"
            level={enableStreamLogs() ? 'error' : 'info'}
          >
            <span>{`${enableStreamLogs() ? t('admin.logs.stop')! : t('admin.logs.start')!}`}</span>
          </Button>
        </div>
        <div class="flex flex-row flex-wrap p-3 lg:p-6 !pb-0">
          <For each={logFiles()}>
            {file => (
              <Button
                class="font-normal flex flex-col !h-auto py-2 m-1 overflow-hidden"
                loading={downloadingFile() === file}
                onClick={() => downloadLog(file)}
              >
                <Show when={downloadingFile() !== file}>
                  <span class="icon-[fluent--folder-zip-20-regular] w-8 h-8 flex-shrink-0"></span>
                </Show>
                <span class="truncate">{file.replace('ret2shell.', '').replace('.log', '')}</span>
              </Button>
            )}
          </For>
        </div>
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
                <span class="opacity-60 font-bold">
                  {DateTime.fromISO(log.timestamp).toFormat('yyyy-MM-dd HH:mm:ss')}
                </span>
              </div>
            )}
          </For>
          <Show when={loading()}>
            <div class="h-8 flex flex-row items-center space-x-2 border-b border-b-layer-content/10 overflow-hidden min-w-0">
              <LoadingTips />
            </div>
          </Show>
          <Show when={logs().length === 0}>
            <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
              <span class="icon-[fluent--code-20-regular] w-24 h-24"></span>
              <span>{t('admin.logs.empty')}</span>
              <span>{t('admin.logs.emptyTips')}</span>
            </div>
          </Show>
          <div ref={bottomDiv!}></div>
        </div>
      </div>
    </>
  )
}

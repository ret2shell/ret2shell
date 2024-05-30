import { getBulletinList } from '@/lib/api/bulletin'
import Spin from '@/lib/assets/animates/spin'
import { Article } from '@/lib/models/article'
import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import { randomTips } from '@/lib/utils/loading-tips'
import Divider from '@/lib/widgets/divider'
import Link from '@/lib/widgets/link'
import Pagination from '@/lib/widgets/pagination'
import { HTTPError } from '@reverier/ky'
import { For, Match, Show, Switch, createEffect, createSignal, untrack } from 'solid-js'

export default function () {
  const [articles, setArticles] = createSignal<Article[]>([])
  const [total, setTotal] = createSignal(0)
  const [page, setPage] = createSignal(1)
  const [loading, setLoading] = createSignal(false)
  function fetchArticles() {
    setLoading(true)
    getBulletinList(page(), 10)
      .then(([a, t]) => {
        setArticles(a)
        setTotal(t)
      })
      .catch((err: HTTPError) => {
        void err.response.text().then(reason => {
          addToast({ level: 'error', description: `${t('bulletin.fetchFailed')}: ${reason}`, duration: 5000 })
        })
      })
      .finally(() => setLoading(false))
  }
  createEffect(() => {
    if (page()) untrack(fetchArticles)
  })
  return (
    <>
      <Title title={`${t('bulletin.title')} - ${platformStore.config.name || t('platform.name')}`} />
      <div class="flex flex-col space-y-2 p-3 lg:p-6 flex-1 w-full max-w-5xl self-center">
        <div class="h-12 relative flex flex-row items-center px-4">
          <h1 class="space-x-2 flex flex-row items-center flex-1">
            <span class="icon-[fluent--megaphone-20-regular] w-5 h-5"></span>
            <span class="font-bold">{t('bulletin.title')}</span>
          </h1>
          <Show when={accountStore.permissions.includes(Permission.Bulletin)}>
            <Link size="sm" level="primary" href="/bulletin/create">
              <span class="icon-[fluent--add-20-regular] w-5 h-5"></span>
              <span>{t('bulletin.create')}</span>
            </Link>
          </Show>
          <Divider class="absolute bottom-0 left-2 right-2"></Divider>
        </div>
        <For each={articles()}>
          {article => (
            <>
              <Link ghost justify="start" href={`/bulletin/${article.id}`} class="overflow-hidden relative">
                {/* icon-[fluent--megaphone-20-regular] icon-[fluent--megaphone-20-filled] */}
                <span
                  class={`icon-[fluent--megaphone-20-${article.weight >= 1 ? 'filled' : 'regular'}] w-5 h-5 text-${
                    article.weight >= 1 ? 'primary' : 'layer-content'
                  }`}
                ></span>
                <span class="flex-1 text-start truncate font-normal">{article.title}</span>
                <span class="opacity-60">{article.created_at.toFormat('yyyy-MM-dd')}</span>
                <Divider class="absolute bottom-0 left-2 right-2"></Divider>
              </Link>
            </>
          )}
        </For>
        <Switch>
          <Match when={articles().length === 0 && !loading()}>
            <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
              <span class="icon-[fluent--megaphone-20-regular] w-24 h-24"></span>
              <span>{t('bulletin.noMore')}</span>
            </div>
          </Match>
          <Match when={loading()}>
            <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
              <Spin width={32} height={32}></Spin>
              <span>{randomTips()}</span>
            </div>
          </Match>
        </Switch>
      </div>
      <Pagination
        class="p-6 lg:p-9"
        count={page() * total()}
        pageSize={10}
        page={page()}
        onPageChange={page => setPage(page.page)}
      />
    </>
  )
}

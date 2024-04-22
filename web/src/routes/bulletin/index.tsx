import { getBulletinList } from '@/lib/api/bulletin'
import { Article } from '@/lib/models/article'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import Link from '@/lib/widgets/link'
import Pagination from '@/lib/widgets/pagination'
import { For, createEffect, createSignal, untrack } from 'solid-js'

export default function () {
  const [articles, setArticles] = createSignal<Article[]>([])
  const [total, setTotal] = createSignal(0)
  const [page, setPage] = createSignal(1)
  function fetchArticles() {
    getBulletinList(page(), 10).then(([a, t]) => {
      setArticles(a)
      setTotal(t)
    })
  }
  fetchArticles()
  createEffect(() => {
    if (page()) untrack(fetchArticles)
  })
  return (
    <>
      <Title title={`${t('bulletin.title')} - ${platformStore.config.name || t('platform.name')}`} />
      <div class="flex flex-col space-y-2 p-3 lg:p-6 flex-1 w-full max-w-5xl self-center">
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
                <span class="flex-1 text-start truncate">{article.title}</span>
                <span class="opacity-60">{article.created_at.toFormat('yyyy-MM-dd')}</span>
                <div class="absolute bottom-0 left-2 right-2 h-[1px] bg-layer-content/30"></div>
              </Link>
            </>
          )}
        </For>
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

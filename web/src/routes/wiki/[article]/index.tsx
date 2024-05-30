import Spin from '@/lib/assets/animates/spin'
import { Article as ArticleModel } from '@/lib/models/article'
import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import Article from '@/lib/widgets/article'
import { HTTPError } from '@reverier/ky'
import { useNavigate, useParams, useSearchParams } from '@solidjs/router'
import { Show, createEffect, onCleanup, untrack } from 'solid-js'
import EditForm from '../_blocks/form'
import { deleteWiki, getWiki } from '@/lib/api/wiki'
import { refreshWikiToc, setWikiStore, wikiStore } from '@/lib/storage/wiki'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'

export default function () {
  const params = useParams()
  const article_id = () => parseInt(params.article)
  const [searchParams, setSearchParams] = useSearchParams()
  const inEdit = () => searchParams.edit === 'true'
  const navigate = useNavigate()

  createEffect(() => {
    if (isNaN(article_id())) navigate('/errors/404', { replace: true })
    untrack(() => {
      getWiki(article_id())
        .then(resp => {
          setWikiStore({ current: resp })
          // console.log(resp)
        })
        .catch((err: HTTPError) => {
          void err.response.text().then(reason => {
            addToast({ level: 'error', description: reason, duration: 5000 })
            navigate(`/errors/${err.response.status}`, { replace: true })
          })
        })
    })
  })

  onCleanup(() => {
    setWikiStore({ current: null })
  })

  function onDelete() {
    deleteWiki(article_id())
      .then(() => {
        addToast({ level: 'success', description: t('wiki.deleteSuccess')!, duration: 5000 })
        void refreshWikiToc().then(() => navigate('/wiki', { replace: true }))
      })
      .catch((err: HTTPError) => {
        void err.response.text().then(reason => {
          addToast({ level: 'error', description: reason, duration: 5000 })
        })
      })
  }

  function onDone(article: ArticleModel) {
    getWiki(article.id)
      .then(resp => {
        setWikiStore({ current: resp })
        void refreshWikiToc()
      })
      .catch((err: HTTPError) => {
        void err.response.text().then(reason => {
          addToast({ level: 'error', description: reason, duration: 5000 })
          navigate(`/errors/${err.response.status}`, { replace: true })
        })
      })
    setSearchParams({ edit: undefined })
  }
  return (
    <>
      <Title title={`${wikiStore.current?.title} - ${platformStore.config.name || t('platform.name')}`}></Title>
      <div class="flex-1 flex flex-col">
        <h1 class="text-3xl text-center flex flex-row space-x-4 items-center justify-center font-bold mt-8 print:mt-16">
          <Show
            when={wikiStore.current}
            fallback={
              <>
                <Spin width={32} height={32} />
                <span>{t('article.loading')}</span>
              </>
            }
          >
            <span>{wikiStore.current!.title}</span>
          </Show>
        </h1>
        <div class="flex flex-row items-center justify-center space-x-6 print:space-x-2 opacity-60 flex-wrap py-3">
          <a
            class="hover:underline font-bold flex flex-row space-x-2 items-center"
            title={t('article.by', { name: wikiStore.current?.publisher_name || t('article.unknownPublisher')! })}
            href={`/users/${wikiStore.current?.publisher_id}`}
          >
            <span class="icon-[fluent--person-20-regular] w-5 h-5 print:hidden"></span>
            <span class="hidden print:inline-block">By</span>
            <span>{wikiStore.current?.publisher_name}</span>
          </a>
          <div
            class="font-bold flex flex-row space-x-2 items-center"
            title={t('article.createdAt', {
              time: wikiStore.current?.created_at.toFormat('yyyy-MM-dd HH:mm:ss') || 'UNKNOWN',
            })}
          >
            <span class="icon-[fluent--calendar-20-regular] w-5 h-5 print:hidden"></span>
            <span class="hidden print:inline-block">at</span>
            <span>{wikiStore.current?.created_at.toFormat('yyyy-MM-dd HH:mm:ss')}</span>
          </div>
          <Show
            when={
              wikiStore.current?.created_at &&
              wikiStore.current?.updated_at &&
              wikiStore.current.created_at !== wikiStore.current.updated_at
            }
          >
            <div
              class="font-bold flex flex-row space-x-2 items-center print:hidden"
              title={t('article.updatedAt', {
                time: wikiStore.current?.updated_at.toFormat('yyyy-MM-dd HH:mm:ss') || 'UNKNOWN',
              })}
            >
              <span class="icon-[fluent--calendar-edit-20-regular] w-5 h-5"></span>
              <span>{wikiStore.current?.updated_at.toFormat('yyyy-MM-dd HH:mm:ss')}</span>
            </div>
          </Show>
          <Show when={accountStore.permissions.includes(Permission.Wiki)}>
            <a
              class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
              href={`/wiki/${wikiStore.current?.id}?edit=true`}
            >
              <span class="icon-[fluent--edit-20-regular] w-5 h-5"></span>
              <span>{t('form.edit')}</span>
            </a>
            <button
              class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
              onClick={onDelete}
            >
              <span class="icon-[fluent--delete-20-regular] w-5 h-5"></span>
              <span>{t('form.delete')}</span>
            </button>
          </Show>
          <button
            class="font-bold hover:underline flex flex-row space-x-2 items-center print:hidden"
            onClick={() => print()}
          >
            <span class="icon-[fluent--print-20-regular] w-5 h-5"></span>
            <span>{t('form.print')}</span>
          </button>
        </div>
        <Show
          when={inEdit()}
          fallback={
            <Article
              class="self-center"
              content={wikiStore.current?.content || ''}
              extra={true}
              headingAnchors={true}
            />
          }
        >
          <EditForm editSource={wikiStore.current || undefined} onDone={onDone} />
        </Show>
      </div>
    </>
  )
}
